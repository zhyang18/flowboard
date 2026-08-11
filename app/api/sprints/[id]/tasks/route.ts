import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, sprints, tasks } from "@/db/schema";
import { canManageProject, getProjectAccess } from "@/lib/authorization";
import { apiError } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import {
  hasTasksFromOtherSprint,
  isCompletedSprintStatus,
  projectLifecycleLockQueries,
} from "@/lib/sprints";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 用完整任务 ID 集合替换迭代范围。
 *
 * @param request 当前迭代规划请求。
 * @param context 包含迭代 ID 的路由上下文。
 * @return 更新成功标记。
 */
export async function PUT(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  const { id } = await context.params;

  let body: { taskIds?: unknown };
  try {
    body = (await request.json()) as { taskIds?: unknown };
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  const taskIds = Array.isArray(body.taskIds)
    ? [...new Set(body.taskIds.filter((value): value is string => typeof value === "string"))]
    : [];
  if (taskIds.length > 500) return apiError("单个迭代最多规划 500 项任务。");

  const db = getDb();
  const [sprint] = await db.select().from(sprints).where(eq(sprints.id, id)).limit(1);
  if (!sprint) return apiError("迭代不存在。", 404);
  const access = await getProjectAccess(currentUser, sprint.projectId);
  if (!access || access.archived) return apiError("迭代不存在。", 404);
  if (!canManageProject(currentUser, access)) return apiError("无权规划迭代任务。", 403);
  if (sprint.status === "completed") {
    return apiError("已完成迭代为历史快照，请先重新打开后再调整任务范围。", 409);
  }

  try {
    await db.transaction(async (tx) => {
      for (const lockQuery of projectLifecycleLockQueries([sprint.projectId])) {
        await tx.execute(lockQuery);
      }
      const [lockedSprint] = await tx
        .select({ status: sprints.status })
        .from(sprints)
        .where(eq(sprints.id, id))
        .limit(1);
      if (!lockedSprint || isCompletedSprintStatus(lockedSprint.status)) {
        throw new Error("COMPLETED_SPRINT");
      }
      if (taskIds.length) {
        const selected = await tx
          .select({
            id: tasks.id,
            sprintId: tasks.sprintId,
            sourceSprintStatus: sprints.status,
          })
          .from(tasks)
          .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
          .where(and(inArray(tasks.id, taskIds), eq(tasks.projectId, sprint.projectId)));
        if (selected.length !== taskIds.length) {
          throw new Error("INVALID_TASK_SCOPE");
        }
        if (selected.some((task) => isCompletedSprintStatus(task.sourceSprintStatus))) {
          throw new Error("COMPLETED_SOURCE_SPRINT");
        }
        if (hasTasksFromOtherSprint(selected.map((task) => task.sprintId), id)) {
          throw new Error("TASK_ALREADY_PLANNED");
        }
      }

      await tx
        .update(tasks)
        .set({ sprintId: null, updatedAt: new Date() })
        .where(eq(tasks.sprintId, id));
      if (taskIds.length) {
        await tx
          .update(tasks)
          .set({ sprintId: id, updatedAt: new Date() })
          .where(and(inArray(tasks.id, taskIds), eq(tasks.projectId, sprint.projectId)));
      }
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "sprint.tasks.update",
        entityType: "sprint",
        entityId: id,
        metadata: { taskIds },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "COMPLETED_SPRINT") {
      return apiError("已完成迭代为历史快照，请先重新打开后再调整任务范围。", 409);
    }
    if (error instanceof Error && error.message === "COMPLETED_SOURCE_SPRINT") {
      return apiError("所选任务属于已完成迭代，请先重新打开原迭代后再调整。", 409);
    }
    if (error instanceof Error && error.message === "INVALID_TASK_SCOPE") {
      return apiError("只能加入同一项目中的有效任务。");
    }
    if (error instanceof Error && error.message === "TASK_ALREADY_PLANNED") {
      return apiError("所选任务已属于其他迭代，请先从原迭代移出。", 409);
    }
    throw error;
  }
}
