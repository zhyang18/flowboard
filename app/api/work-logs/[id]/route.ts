import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, sprints, tasks, workLogs } from "@/db/schema";
import { canManageProject, getProjectAccess } from "@/lib/authorization";
import { apiError } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import {
  isCompletedSprintStatus,
  projectLifecycleLockQueries,
} from "@/lib/sprints";
import { canDeleteWorkLog } from "@/lib/work-logs";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

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
      taskStatus: tasks.status,
      taskActualHours: tasks.actualHours,
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
  if (existing.userId !== currentUser.id && !canManageProject(currentUser, access)) {
    return apiError("无权删除该工时记录。", 403);
  }
  if (isCompletedSprintStatus(existing.sprintStatus)) {
    return apiError("已完成迭代为历史快照，请先重新打开后再删除工时。", 409);
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
          taskStatus: tasks.status,
          taskActualHours: tasks.actualHours,
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
        lockedExisting.taskId !== existing.taskId
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
      )) {
        throw new Error("DONE_TASK_REQUIRES_WORK_LOG");
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
    throw error;
  }
}
