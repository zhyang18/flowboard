import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, projects, users } from "@/db/schema";
import {
  apiError,
  canManageUsers,
  isUniqueViolation,
  textValue,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import {
  isProjectStatus,
  parseDate,
  projectCode,
  serializeProject,
} from "@/lib/workspace";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权编辑项目。", 403);

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
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!existing || existing.archived) return apiError("项目不存在。", 404);

  const startDate =
    "startDate" in body ? parseDate(body.startDate) : existing.startDate;
  const dueDate = "dueDate" in body ? parseDate(body.dueDate) : existing.dueDate;
  if (startDate === undefined || dueDate === undefined) {
    return apiError("项目日期格式无效。");
  }
  if (startDate && dueDate && dueDate < startDate) {
    return apiError("截止日期不能早于开始日期。");
  }

  const ownerId =
    typeof body.ownerId === "string" && body.ownerId
      ? body.ownerId
      : existing.ownerId;
  if (ownerId !== existing.ownerId) {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);
    if (!owner) return apiError("项目负责人不存在。");
  }

  const name = "name" in body ? textValue(body.name, 80) : existing.name;
  const code = "code" in body ? projectCode(body.code) : existing.code;
  if (!name || !code) return apiError("项目名称和代号不能为空。");

  const update = {
    name,
    code,
    description:
      "description" in body
        ? textValue(body.description, 500)
        : existing.description,
    color:
      "color" in body && /^#[0-9a-f]{6}$/i.test(String(body.color))
        ? String(body.color)
        : existing.color,
    status: isProjectStatus(body.status) ? body.status : existing.status,
    ownerId,
    startDate,
    dueDate,
    updatedAt: new Date(),
  };

  try {
    const [updated] = await db
      .update(projects)
      .set(update)
      .where(eq(projects.id, id))
      .returning();

    await db.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "project.update",
      entityType: "project",
      entityId: id,
      metadata: { changedFields: Object.keys(body) },
    });

    return NextResponse.json({ data: serializeProject(updated) });
  } catch (error) {
    if (isUniqueViolation(error)) return apiError("项目代号已存在。", 409);
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权归档项目。", 403);

  const { id } = await context.params;
  const db = getDb();
  const [archived] = await db
    .update(projects)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning({ id: projects.id, name: projects.name });
  if (!archived) return apiError("项目不存在。", 404);

  await db.insert(auditLogs).values({
    actorId: currentUser.id,
    action: "project.archive",
    entityType: "project",
    entityId: id,
    metadata: { name: archived.name },
  });

  return NextResponse.json({ success: true });
}
