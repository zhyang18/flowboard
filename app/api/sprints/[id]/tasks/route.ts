import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, sprints, tasks } from "@/db/schema";
import { apiError, canManageUsers } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权规划迭代任务。", 403);

  const { id } = await context.params;
  let body: { taskIds?: unknown };
  try {
    body = (await request.json()) as { taskIds?: unknown };
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  const taskIds = Array.isArray(body.taskIds)
    ? body.taskIds.filter((value): value is string => typeof value === "string")
    : [];

  const db = getDb();
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, id))
    .limit(1);
  if (!sprint) return apiError("迭代不存在。", 404);

  if (taskIds.length) {
    const selected = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(inArray(tasks.id, taskIds), eq(tasks.projectId, sprint.projectId)));
    if (selected.length !== new Set(taskIds).size) {
      return apiError("只能加入同一项目中的有效任务。");
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ sprintId: null, updatedAt: new Date() })
      .where(eq(tasks.sprintId, id));
    if (taskIds.length) {
      await tx
        .update(tasks)
        .set({ sprintId: id, updatedAt: new Date() })
        .where(inArray(tasks.id, taskIds));
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
}
