import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, projects, sprints } from "@/db/schema";
import { apiError, canManageUsers, textValue } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import {
  isSprintStatus,
  parseDate,
  safeHours,
  serializeSprint,
} from "@/lib/workspace";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权编辑迭代。", 403);

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
    .from(sprints)
    .where(eq(sprints.id, id))
    .limit(1);
  if (!existing) return apiError("迭代不存在。", 404);

  const projectId =
    typeof body.projectId === "string" && body.projectId
      ? body.projectId
      : existing.projectId;
  if (projectId !== existing.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return apiError("所属项目不存在。");
  }

  const startDate =
    "startDate" in body ? parseDate(body.startDate) : existing.startDate;
  const endDate = "endDate" in body ? parseDate(body.endDate) : existing.endDate;
  if (!startDate || !endDate || startDate === undefined || endDate === undefined) {
    return apiError("请填写有效的迭代周期。");
  }
  if (endDate < startDate) return apiError("结束日期不能早于开始日期。");

  const name = "name" in body ? textValue(body.name, 80) : existing.name;
  if (!name) return apiError("迭代名称不能为空。");

  const [updated] = await db
    .update(sprints)
    .set({
      projectId,
      name,
      goal: "goal" in body ? textValue(body.goal, 500) : existing.goal,
      status: isSprintStatus(body.status) ? body.status : existing.status,
      capacityHours:
        "capacityHours" in body
          ? safeHours(body.capacityHours)
          : existing.capacityHours,
      startDate,
      endDate,
      updatedAt: new Date(),
    })
    .where(eq(sprints.id, id))
    .returning();

  await db.insert(auditLogs).values({
    actorId: currentUser.id,
    action: "sprint.update",
    entityType: "sprint",
    entityId: id,
    metadata: { changedFields: Object.keys(body) },
  });

  return NextResponse.json({ data: serializeSprint(updated) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权删除迭代。", 403);

  const { id } = await context.params;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, id))
    .limit(1);
  if (!existing) return apiError("迭代不存在。", 404);
  if (existing.status === "active") return apiError("进行中的迭代不能直接删除。");

  await db.transaction(async (tx) => {
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "sprint.delete",
      entityType: "sprint",
      entityId: id,
      metadata: { name: existing.name },
    });
    await tx.delete(sprints).where(eq(sprints.id, id));
  });

  return NextResponse.json({ success: true });
}
