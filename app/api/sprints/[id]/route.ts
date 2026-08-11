import { and, count, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, sprints, tasks } from "@/db/schema";
import { canManageProject, getProjectAccess } from "@/lib/authorization";
import {
  apiError,
  isConstraintViolation,
  isUniqueViolation,
  textValue,
} from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import {
  canTransitionSprintStatus,
  hasOtherActiveSprint,
  isCompletedSprintStatus,
  projectLifecycleLockQueries,
} from "@/lib/sprints";
import {
  isSprintStatus,
  parseDate,
  safeHours,
  serializeSprint,
} from "@/lib/workspace";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 更新迭代资料，并校验原项目和目标项目的管理权限。
 *
 * @param request 当前更新请求。
 * @param context 包含迭代 ID 的路由上下文。
 * @return 更新后的迭代记录。
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
  const db = getDb();
  const [existing] = await db.select().from(sprints).where(eq(sprints.id, id)).limit(1);
  if (!existing) return apiError("迭代不存在。", 404);
  const existingAccess = await getProjectAccess(currentUser, existing.projectId);
  if (!existingAccess || existingAccess.archived) return apiError("迭代不存在。", 404);
  if (!canManageProject(currentUser, existingAccess)) return apiError("无权编辑迭代。", 403);

  const projectId =
    typeof body.projectId === "string" && body.projectId ? body.projectId : existing.projectId;
  if (projectId !== existing.projectId) {
    const [taskCount] = await db
      .select({ value: count() })
      .from(tasks)
      .where(eq(tasks.sprintId, id));
    if (Number(taskCount?.value ?? 0) > 0) {
      return apiError("该迭代已规划任务，清空任务范围后才能更换项目。", 409);
    }
    const targetAccess = await getProjectAccess(currentUser, projectId);
    if (!targetAccess || targetAccess.archived) return apiError("所属项目不存在。", 404);
    if (!canManageProject(currentUser, targetAccess)) {
      return apiError("无权将迭代移动到目标项目。", 403);
    }
  }

  const startDate = "startDate" in body ? parseDate(body.startDate) : existing.startDate;
  const endDate = "endDate" in body ? parseDate(body.endDate) : existing.endDate;
  if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
    return apiError("请填写有效的迭代周期。");
  }
  if (endDate < startDate) return apiError("结束日期不能早于开始日期。");
  const name = "name" in body ? textValue(body.name, 80) : existing.name;
  if (!name) return apiError("迭代名称不能为空。");
  if ("status" in body && !isSprintStatus(body.status)) {
    return apiError("迭代状态无效。");
  }
  const status = isSprintStatus(body.status) ? body.status : existing.status;
  if (!canTransitionSprintStatus(existing.status, status)) {
    return apiError("迭代状态只能按“未开始 → 进行中 → 已完成”流转。", 409);
  }
  if (isCompletedSprintStatus(existing.status)) {
    const changesSnapshot = Object.keys(body).some((field) => field !== "status");
    if (status !== "active" || changesSnapshot) {
      return apiError("已完成迭代为历史快照，只能通过重新打开操作恢复为进行中。", 409);
    }
  }

  try {
    const updated = await db.transaction(async (tx) => {
      for (const lockQuery of projectLifecycleLockQueries([existing.projectId, projectId])) {
        await tx.execute(lockQuery);
      }
      const [lockedExisting] = await tx
        .select({ status: sprints.status, updatedAt: sprints.updatedAt })
        .from(sprints)
        .where(eq(sprints.id, id))
        .limit(1);
      if (
        !lockedExisting ||
        lockedExisting.updatedAt.getTime() !== existing.updatedAt.getTime()
      ) {
        throw new Error("SPRINT_CHANGED");
      }
      if (!isCompletedSprintStatus(existing.status) && isCompletedSprintStatus(lockedExisting.status)) {
        throw new Error("COMPLETED_SPRINT");
      }
      if (!canTransitionSprintStatus(lockedExisting.status, status)) {
        throw new Error("INVALID_SPRINT_TRANSITION");
      }
      if (projectId !== existing.projectId) {
        const [lockedTaskCount] = await tx
          .select({ value: count() })
          .from(tasks)
          .where(eq(tasks.sprintId, id));
        if (Number(lockedTaskCount?.value ?? 0) > 0) {
          throw new Error("SPRINT_HAS_TASKS");
        }
      }
      if (lockedExisting.status === "active" && status === "completed") {
        const [unfinishedTaskCount] = await tx
          .select({ value: count() })
          .from(tasks)
          .where(and(eq(tasks.sprintId, id), ne(tasks.status, "done")));
        if (Number(unfinishedTaskCount?.value ?? 0) > 0) {
          throw new Error("SPRINT_HAS_UNFINISHED_TASKS");
        }
      }
      if (status === "active") {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`active-sprint:${projectId}`}))`,
        );
        const activeSprints = await tx
          .select({ id: sprints.id })
          .from(sprints)
          .where(and(eq(sprints.projectId, projectId), eq(sprints.status, "active")))
          .limit(2);
        if (hasOtherActiveSprint(activeSprints.map((sprint) => sprint.id), id)) {
          throw new Error("ACTIVE_SPRINT_EXISTS");
        }
      }
      const [sprint] = await tx
        .update(sprints)
        .set({
          projectId,
          name,
          goal: "goal" in body ? textValue(body.goal, 500) : existing.goal,
          status,
          capacityHours:
            "capacityHours" in body ? safeHours(body.capacityHours) : existing.capacityHours,
          startDate,
          endDate,
          updatedAt: new Date(),
        })
        .where(eq(sprints.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "sprint.update",
        entityType: "sprint",
        entityId: id,
        metadata: {
          changedFields: Object.keys(body),
          fromStatus: existing.status,
          toStatus: sprint.status,
        },
      });
      return sprint;
    });
    return NextResponse.json({ data: serializeSprint(updated) });
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVE_SPRINT_EXISTS") {
      return apiError("同一项目只能有一个进行中的迭代。", 409);
    }
    if (error instanceof Error && error.message === "COMPLETED_SPRINT") {
      return apiError("已完成迭代为历史快照，请先重新打开后再修改。", 409);
    }
    if (error instanceof Error && error.message === "INVALID_SPRINT_TRANSITION") {
      return apiError("迭代状态只能按“未开始 → 进行中 → 已完成”流转。", 409);
    }
    if (error instanceof Error && error.message === "SPRINT_HAS_TASKS") {
      return apiError("该迭代已规划任务，清空任务范围后才能更换项目。", 409);
    }
    if (error instanceof Error && error.message === "SPRINT_HAS_UNFINISHED_TASKS") {
      return apiError("迭代仍有未完成任务，请先完成任务或将其移出本迭代。", 409);
    }
    if (error instanceof Error && error.message === "SPRINT_CHANGED") {
      return apiError("迭代已被其他操作更新，请刷新后重试。", 409);
    }
    if (isConstraintViolation(error, "sprints_one_active_per_project")) {
      return apiError("同一项目只能有一个进行中的迭代。", 409);
    }
    if (isUniqueViolation(error)) return apiError("同一项目中不能存在重名迭代。", 409);
    throw error;
  }
}

/**
 * 删除非进行中的迭代并保留任务，任务会自动退出该迭代。
 *
 * @param request 当前删除请求。
 * @param context 包含迭代 ID 的路由上下文。
 * @return 删除成功标记。
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  const { id } = await context.params;
  const db = getDb();
  const [existing] = await db.select().from(sprints).where(eq(sprints.id, id)).limit(1);
  if (!existing) return apiError("迭代不存在。", 404);
  const access = await getProjectAccess(currentUser, existing.projectId);
  if (!access || access.archived) return apiError("迭代不存在。", 404);
  if (!canManageProject(currentUser, access)) return apiError("无权删除迭代。", 403);
  if (existing.status !== "planned") {
    return apiError("只有尚未开始的迭代可以删除；进行中或已完成迭代需保留历史。", 409);
  }

  try {
    await db.transaction(async (tx) => {
      for (const lockQuery of projectLifecycleLockQueries([existing.projectId])) {
        await tx.execute(lockQuery);
      }
      const [lockedExisting] = await tx
        .select({ status: sprints.status, updatedAt: sprints.updatedAt })
        .from(sprints)
        .where(eq(sprints.id, id))
        .limit(1);
      if (
        !lockedExisting ||
        lockedExisting.updatedAt.getTime() !== existing.updatedAt.getTime()
      ) {
        throw new Error("SPRINT_CHANGED");
      }
      if (lockedExisting.status !== "planned") throw new Error("SPRINT_NOT_PLANNED");
      await tx
        .update(tasks)
        .set({ sprintId: null, updatedAt: new Date() })
        .where(eq(tasks.sprintId, id));
      const [deleted] = await tx
        .delete(sprints)
        .where(eq(sprints.id, id))
        .returning({ id: sprints.id });
      if (!deleted) throw new Error("SPRINT_CHANGED");
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "sprint.delete",
        entityType: "sprint",
        entityId: id,
        metadata: { name: existing.name },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "SPRINT_NOT_PLANNED") {
      return apiError("只有尚未开始的迭代可以删除；进行中或已完成迭代需保留历史。", 409);
    }
    if (error instanceof Error && error.message === "SPRINT_CHANGED") {
      return apiError("迭代已被其他操作更新，请刷新后重试。", 409);
    }
    throw error;
  }
}
