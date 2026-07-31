import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, projects, sprints, tasks, users } from "@/db/schema";
import { apiError, canManageUsers, textValue } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import {
  isTaskPriority,
  isTaskStatus,
  parseDate,
  safeHours,
  serializeTask,
} from "@/lib/workspace";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
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
  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!existing) return apiError("任务不存在。", 404);

  const projectId =
    typeof body.projectId === "string" && body.projectId
      ? body.projectId
      : existing.projectId;
  if (projectId !== existing.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.archived, false)))
      .limit(1);
    if (!project) return apiError("所属项目不存在。");
  }

  const assigneeId =
    "assigneeId" in body
      ? typeof body.assigneeId === "string" && body.assigneeId
        ? body.assigneeId
        : null
      : existing.assigneeId;
  const sprintId =
    "sprintId" in body
      ? typeof body.sprintId === "string" && body.sprintId
        ? body.sprintId
        : null
      : existing.sprintId;
  if (assigneeId && assigneeId !== existing.assigneeId) {
    const [assignee] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, assigneeId), eq(users.status, "active")))
      .limit(1);
    if (!assignee) return apiError("任务负责人不存在。");
  }

  if (sprintId && sprintId !== existing.sprintId) {
    const [sprint] = await db
      .select({ id: sprints.id })
      .from(sprints)
      .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, projectId)))
      .limit(1);
    if (!sprint) return apiError("迭代不存在或不属于所选项目。");
  }

  const title = "title" in body ? textValue(body.title, 160) : existing.title;
  if (!title) return apiError("任务标题不能为空。");
  const dueDate = "dueDate" in body ? parseDate(body.dueDate) : existing.dueDate;
  if (dueDate === undefined) return apiError("截止日期格式无效。");

  const status = isTaskStatus(body.status) ? body.status : existing.status;
  let sortOrder = existing.sortOrder;
  if (status !== existing.status) {
    const [order] = await db
      .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), -1) + 1` })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)));
    sortOrder = Number(order?.value ?? 0);
  } else if (Number.isInteger(body.sortOrder)) {
    sortOrder = Math.max(0, Number(body.sortOrder));
  }

  const [updated] = await db
    .update(tasks)
    .set({
      projectId,
      sprintId,
      title,
      description:
        "description" in body
          ? textValue(body.description, 1500)
          : existing.description,
      status,
      priority: isTaskPriority(body.priority) ? body.priority : existing.priority,
      assigneeId,
      estimateHours:
        "estimateHours" in body
          ? safeHours(body.estimateHours)
          : existing.estimateHours,
      actualHours:
        "actualHours" in body ? safeHours(body.actualHours) : existing.actualHours,
      sortOrder,
      dueDate,
      completedAt:
        status === "done"
          ? existing.completedAt ?? new Date()
          : null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();

  await db.insert(auditLogs).values({
    actorId: currentUser.id,
    action: "task.update",
    entityType: "task",
    entityId: id,
    metadata: {
      changedFields: Object.keys(body),
      fromStatus: existing.status,
      toStatus: updated.status,
    },
  });

  return NextResponse.json({ data: serializeTask(updated) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!existing) return apiError("任务不存在。", 404);
  if (
    existing.reporterId !== currentUser.id &&
    !canManageUsers(currentUser)
  ) {
    return apiError("只能删除自己创建的任务。", 403);
  }

  await db.transaction(async (tx) => {
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "task.delete",
      entityType: "task",
      entityId: id,
      metadata: { title: existing.title, projectId: existing.projectId },
    });
    await tx.delete(tasks).where(eq(tasks.id, id));
  });

  return NextResponse.json({ success: true });
}
