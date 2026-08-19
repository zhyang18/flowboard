import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, customRoles, users } from "@/db/schema";
import { apiError } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { validateRoleInput } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 更新指定角色的名称、描述、色调和权限配置。
 *
 * @param request HTTP 请求对象。
 * @param context 路由动态参数上下文，包含角色的 id。
 * @return 更新后的角色数据响应或错误响应。
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (currentUser.role !== "super_admin") return apiError("只有超级管理员可以编辑角色。", 403);

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const validationError = validateRoleInput(body);
  if (validationError) return apiError(validationError, 400);

  const db = getDb();
  const [existing] = await db
    .select()
    .from(customRoles)
    .where(eq(customRoles.id, id))
    .limit(1);

  if (!existing) return apiError("角色不存在。", 404);

  const updateValues: Partial<typeof customRoles.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof body.name === "string" && body.name.trim()) {
    updateValues.name = body.name.trim();
  }
  if (typeof body.description === "string") {
    updateValues.description = body.description.trim();
  }
  if (typeof body.tone === "string") {
    updateValues.tone = body.tone;
  }
  if (Array.isArray(body.permissions)) {
    updateValues.permissions = body.permissions as boolean[];
  }

  try {
    const [updated] = await db.transaction(async (tx) => {
      const [saved] = await tx
        .update(customRoles)
        .set(updateValues)
        .where(eq(customRoles.id, id))
        .returning();

      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "role.update",
        entityType: "role",
        entityId: id,
        metadata: { changedFields: Object.keys(updateValues) },
      });

      return [saved];
    });

    const [userCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.role}::text = ${id}`);

    return NextResponse.json({
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        tone: updated.tone,
        permissions: updated.permissions,
        isSystem: updated.isSystem,
        userCount: Number(userCountResult?.count ?? 0),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新角色失败。";
    return apiError(message, 500);
  }
}

/**
 * 删除指定的自定义角色。系统内置角色或仍有绑定用户的角色禁止删除。
 *
 * @param request HTTP 请求对象。
 * @param context 路由动态参数上下文，包含待删除角色的 id。
 * @return 操作结果响应。
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (currentUser.role !== "super_admin") return apiError("只有超级管理员可以删除角色。", 403);

  const { id } = await context.params;
  const db = getDb();

  const [existing] = await db
    .select()
    .from(customRoles)
    .where(eq(customRoles.id, id))
    .limit(1);

  if (!existing) return apiError("角色不存在。", 404);
  if (existing.isSystem) return apiError("系统内置角色不可删除。", 400);

  // 检查是否仍有用户绑定该角色
  const [userCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.role}::text = ${id}`);

  const userCount = Number(userCountResult?.count ?? 0);
  if (userCount > 0) {
    return apiError(`当前仍有 ${userCount} 位成员使用该角色，请先调整相关成员角色后再行删除。`, 400);
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(customRoles).where(eq(customRoles.id, id));
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "role.delete",
        entityType: "role",
        entityId: id,
        metadata: { roleName: existing.name },
      });
    });

    return NextResponse.json({ success: true, message: "角色已删除。" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除角色失败。";
    return apiError(message, 500);
  }
}
