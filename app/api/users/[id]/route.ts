import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import {
  apiError,
  canManageUsers,
  isUniqueViolation,
} from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { getCurrentUser } from "@/lib/session";
import { parseUserInput, serializeUser } from "@/lib/users";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权查看用户资料。", 403);

  const { id } = await context.params;
  const [user] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      department: users.department,
      team: users.team,
      role: users.role,
      status: users.status,
      projectCount: users.projectCount,
      capacity: users.capacity,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) return apiError("用户不存在。", 404);
  return NextResponse.json({ data: serializeUser(user) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权编辑用户。", 403);

  const { id } = await context.params;
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return apiError("用户不存在。", 404);

  if (
    currentUser.role !== "super_admin" &&
    (existing.role === "super_admin" || body.role === "super_admin")
  ) {
    return apiError("只有超级管理员可以维护超级管理员账号。", 403);
  }

  if (
    id === currentUser.id &&
    (("status" in body && body.status !== currentUser.status) ||
      ("role" in body && body.role !== currentUser.role))
  ) {
    return apiError("不能修改当前登录账号的角色或状态。");
  }

  const parsed = parseUserInput(body, true);
  if (parsed.error || !parsed.data) return apiError(parsed.error ?? "用户数据无效。");

  if (
    parsed.data.status === "active" &&
    !existing.passwordHash &&
    !parsed.data.password
  ) {
    return apiError("激活该账号前，请先设置登录密码。");
  }

  const { password, ...fields } = parsed.data;
  const updateData = {
    ...fields,
    ...(password ? { passwordHash: await hashPassword(password) } : {}),
    updatedAt: new Date(),
  };

  try {
    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    await db.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "user.update",
      entityType: "user",
      entityId: id,
      metadata: {
        changedFields: Object.keys(body).filter((key) => key !== "password"),
      },
    });

    return NextResponse.json({ data: serializeUser(updated) });
  } catch (error) {
    if (isUniqueViolation(error)) return apiError("该邮箱已被使用。", 409);
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (currentUser.role !== "super_admin") {
    return apiError("只有超级管理员可以删除账号。", 403);
  }

  const { id } = await context.params;
  if (id === currentUser.id) return apiError("不能删除当前登录账号。");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return apiError("用户不存在。", 404);
  if (existing.status === "active") {
    return apiError("请先停用账号，再执行删除。");
  }

  await db.transaction(async (tx) => {
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "user.delete",
      entityType: "user",
      entityId: id,
      metadata: { email: existing.email, name: existing.name },
    });
    await tx.delete(users).where(eq(users.id, id));
  });

  return NextResponse.json({ success: true });
}
