import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, sprints, tasks, workLogs } from "@/db/schema";
import { canApproveWorkLogs, getProjectAccess } from "@/lib/authorization";
import { apiError, textValue } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import {
  isCompletedSprintStatus,
  projectLifecycleLockQueries,
} from "@/lib/sprints";
import { canDeleteWorkLog, canRecordTaskWork } from "@/lib/work-logs";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 审核工时记录并保留审核人、时间和退回说明。
 *
 * @param request 当前审核请求。
 * @param context 包含工时记录 ID 的路由上下文。
 * @return 更新后的审核状态。
 */
export async function PATCH(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  const approvalStatus = body.approvalStatus;
  if (approvalStatus !== "approved" && approvalStatus !== "rejected") {
    return apiError("工时审核状态无效。");
  }
  const approvalComment = textValue(body.approvalComment, 500);
  if (approvalStatus === "rejected" && !approvalComment) {
    return apiError("退回工时请填写原因。");
  }

  const db = getDb();
  const [existing] = await db
    .select({
      id: workLogs.id,
      userId: workLogs.userId,
      projectId: tasks.projectId,
      approvalStatus: workLogs.approvalStatus,
      updatedAt: workLogs.updatedAt,
    })
    .from(workLogs)
    .innerJoin(tasks, eq(workLogs.taskId, tasks.id))
    .where(eq(workLogs.id, id))
    .limit(1);
  if (!existing) return apiError("工时记录不存在。", 404);
  const access = await getProjectAccess(currentUser, existing.projectId);
  if (!canApproveWorkLogs(currentUser, access)) {
    return apiError("无权审核该项目的工时。", 403);
  }
  if (existing.userId === currentUser.id) {
    return apiError("不能审核自己登记的工时。", 409);
  }

  let updated: typeof workLogs.$inferSelect;
  try {
    updated = await db.transaction(async (tx) => {
      const [record] = await tx
        .update(workLogs)
        .set({
          approvalStatus,
          approvedBy: currentUser.id,
          approvedAt: new Date(),
          approvalComment,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workLogs.id, id),
            eq(workLogs.updatedAt, existing.updatedAt),
          ),
        )
        .returning();
      if (!record) throw new Error("WORK_LOG_CHANGED");
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: `work_log.${approvalStatus}`,
        entityType: "work_log",
        entityId: record.id,
        metadata: {
          previousStatus: existing.approvalStatus,
          approvalComment,
        },
      });
      return record;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "WORK_LOG_CHANGED") {
      return apiError("工时记录已被其他操作更新，请刷新后重试。", 409);
    }
    throw error;
  }
  return NextResponse.json({
    data: {
      id: updated.id,
      approvalStatus: updated.approvalStatus,
      approvedAt: updated.approvedAt?.toISOString() ?? null,
      approvalComment: updated.approvalComment,
    },
  });
}

/**
 * 删除本人或所管理项目的工时记录，并同步扣减任务实际工时。
 *
 * @param request 当前删除请求。
 * @param context 包含工时记录 ID 的路由上下文。
 * @return 删除成功标记。
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  const db = getDb();
  const [existing] = await db
    .select({
      id: workLogs.id,
      taskId: workLogs.taskId,
      userId: workLogs.userId,
      durationHours: workLogs.durationHours,
      projectId: tasks.projectId,
      taskAssigneeId: tasks.assigneeId,
      taskStatus: tasks.status,
      taskActualHours: tasks.actualHours,
      approvalStatus: workLogs.approvalStatus,
      sprintStatus: sprints.status,
    })
    .from(workLogs)
    .innerJoin(tasks, eq(workLogs.taskId, tasks.id))
    .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
    .where(eq(workLogs.id, id))
    .limit(1);
  if (!existing) return apiError("工时记录不存在。", 404);
  const access = await getProjectAccess(currentUser, existing.projectId);
  if (!access || access.archived) return apiError("归档项目的工时历史不能修改。", 409);
  if (
    existing.userId !== currentUser.id ||
    !canRecordTaskWork(currentUser.id, existing.taskAssigneeId)
  ) {
    return apiError("无权删除该工时记录。", 403);
  }
  if (isCompletedSprintStatus(existing.sprintStatus)) {
    return apiError("已完成迭代为历史快照，请先重新打开后再删除工时。", 409);
  }
  if (
    !canDeleteWorkLog(
      existing.taskStatus,
      existing.taskActualHours,
      existing.durationHours,
      existing.approvalStatus,
    )
  ) {
    return apiError("已通过审核的工时不能直接删除，请先由项目负责人退回。", 409);
  }

  try {
    await db.transaction(async (tx) => {
      for (const lockQuery of projectLifecycleLockQueries([existing.projectId])) {
        await tx.execute(lockQuery);
      }
      const [lockedExisting] = await tx
        .select({
          id: workLogs.id,
          taskId: workLogs.taskId,
          userId: workLogs.userId,
          durationHours: workLogs.durationHours,
          projectId: tasks.projectId,
          taskAssigneeId: tasks.assigneeId,
          taskStatus: tasks.status,
          taskActualHours: tasks.actualHours,
          approvalStatus: workLogs.approvalStatus,
          sprintStatus: sprints.status,
        })
        .from(workLogs)
        .innerJoin(tasks, eq(workLogs.taskId, tasks.id))
        .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
        .where(eq(workLogs.id, id))
        .limit(1);
      if (!lockedExisting) throw new Error("WORK_LOG_NOT_FOUND");
      if (
        lockedExisting.projectId !== existing.projectId ||
        lockedExisting.taskId !== existing.taskId ||
        lockedExisting.userId !== currentUser.id ||
        !canRecordTaskWork(currentUser.id, lockedExisting.taskAssigneeId)
      ) {
        throw new Error("WORK_LOG_CHANGED");
      }
      if (isCompletedSprintStatus(lockedExisting.sprintStatus)) {
        throw new Error("COMPLETED_SPRINT");
      }
      if (!canDeleteWorkLog(
        lockedExisting.taskStatus,
        lockedExisting.taskActualHours,
        lockedExisting.durationHours,
        lockedExisting.approvalStatus,
      )) {
        throw new Error(
          lockedExisting.approvalStatus === "approved"
            ? "APPROVED_WORK_LOG"
            : "DONE_TASK_REQUIRES_WORK_LOG",
        );
      }
      const [deleted] = await tx
        .delete(workLogs)
        .where(eq(workLogs.id, id))
        .returning({
          id: workLogs.id,
          taskId: workLogs.taskId,
          userId: workLogs.userId,
          durationHours: workLogs.durationHours,
        });
      if (!deleted) throw new Error("WORK_LOG_NOT_FOUND");
      await tx
        .update(tasks)
        .set({
          actualHours: sql`greatest(0, ${tasks.actualHours} - ${deleted.durationHours})`,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, deleted.taskId));
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "work_log.delete",
        entityType: "work_log",
        entityId: deleted.id,
        metadata: {
          taskId: deleted.taskId,
          userId: deleted.userId,
          durationHours: deleted.durationHours,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "WORK_LOG_NOT_FOUND") {
      return apiError("工时记录不存在或已被删除。", 404);
    }
    if (error instanceof Error && error.message === "WORK_LOG_CHANGED") {
      return apiError("工时记录关联已变化，请刷新后重试。", 409);
    }
    if (error instanceof Error && error.message === "COMPLETED_SPRINT") {
      return apiError("已完成迭代为历史快照，请先重新打开后再删除工时。", 409);
    }
    if (error instanceof Error && error.message === "DONE_TASK_REQUIRES_WORK_LOG") {
      return apiError("已完成任务必须保留实际工时；请先重新打开任务再删除最后一条工时。", 409);
    }
    if (error instanceof Error && error.message === "APPROVED_WORK_LOG") {
      return apiError("已通过审核的工时不能直接删除，请先由项目负责人退回。", 409);
    }
    throw error;
  }
}
