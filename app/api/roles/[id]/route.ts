import { and, count, eq, inArray, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, roleDefinitions, tasks, users } from "@/db/schema";
import { apiError, isConstraintViolation, uuidValue } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { parseRoleDefinitionInput } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 更新角色名称、说明、颜色和权限配置。
 *
 * @param request 当前编辑角色请求。
 * @param context 包含角色 ID 的路由上下文。
 * @return 更新后的角色定义。
 */
export async function PATCH(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (currentUser.role !== "super_admin") {
    return apiError("只有超级管理员可以编辑角色。", 403);
  }
  const id = uuidValue((await context.params).id);
  if (!id) return apiError("角色 ID 无效。");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  const parsed = parseRoleDefinitionInput(body);
  if (!parsed.data || parsed.error) return apiError(parsed.error ?? "角色数据无效。");
  const data = parsed.data;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(roleDefinitions)
    .where(eq(roleDefinitions.id, id))
    .limit(1);
  if (!existing) return apiError("角色不存在。", 404);

  const [assigned] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.roleDefinitionId, id));
  const userCount = Number(assigned?.value ?? 0);
  if (data.baseRole !== existing.baseRole && (existing.isSystem || userCount > 0)) {
    return apiError(
      existing.isSystem
        ? "系统角色不能修改权限基线。"
        : "请先将该角色下的用户调整到其他角色，再修改权限基线。",
      409,
    );
  }
  if (
    existing.permissions.manageTasks &&
    !data.permissions.manageTasks &&
    userCount > 0
  ) {
    const assignedUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.roleDefinitionId, id));
    const assignedUserIds = assignedUsers.map((user) => user.id);
    const [unfinishedResponsibilities] = await db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          ne(tasks.status, "done"),
          or(
            inArray(tasks.assigneeId, assignedUserIds),
            inArray(tasks.testerId, assignedUserIds),
          ),
        ),
      );
    if (Number(unfinishedResponsibilities?.value ?? 0) > 0) {
      return apiError(
        "该角色仍有未完成的开发或测试任务，请先重新指派，再关闭任务管理权限。",
        409,
      );
    }
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [role] = await tx
        .update(roleDefinitions)
        .set({
          name: data.name,
          description: data.description,
          baseRole: existing.isSystem ? existing.baseRole : data.baseRole,
          permissions: data.permissions,
          tone: data.tone,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(roleDefinitions.id, id),
            eq(roleDefinitions.updatedAt, existing.updatedAt),
          ),
        )
        .returning();
      if (!role) throw new Error("ROLE_CHANGED");
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "role.update",
        entityType: "role",
        entityId: id,
        metadata: {
          name: role.name,
          baseRole: role.baseRole,
          permissions: role.permissions,
        },
      });
      return role;
    });
    return NextResponse.json({ data: { ...updated, userCount } });
  } catch (error) {
    if (error instanceof Error && error.message === "ROLE_CHANGED") {
      return apiError("角色已被其他操作更新，请刷新后重试。", 409);
    }
    throw error;
  }
}

/**
 * 删除尚未分配用户的自定义角色。
 *
 * @param request 当前删除角色请求。
 * @param context 包含角色 ID 的路由上下文。
 * @return 删除成功标识。
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (currentUser.role !== "super_admin") {
    return apiError("只有超级管理员可以删除角色。", 403);
  }
  const id = uuidValue((await context.params).id);
  if (!id) return apiError("角色 ID 无效。");

  const db = getDb();
  const [existing] = await db
    .select()
    .from(roleDefinitions)
    .where(eq(roleDefinitions.id, id))
    .limit(1);
  if (!existing) return apiError("角色不存在。", 404);
  if (existing.isSystem) return apiError("系统内置角色不能删除。", 409);

  const [assigned] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.roleDefinitionId, id));
  if (Number(assigned?.value ?? 0) > 0) {
    return apiError("该角色仍有关联用户，请先调整用户角色。", 409);
  }

  try {
    await db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(roleDefinitions)
        .where(
          and(
            eq(roleDefinitions.id, id),
            eq(roleDefinitions.updatedAt, existing.updatedAt),
          ),
        )
        .returning({ id: roleDefinitions.id });
      if (!deleted) throw new Error("ROLE_CHANGED");
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "role.delete",
        entityType: "role",
        entityId: id,
        metadata: { name: existing.name, code: existing.code },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ROLE_CHANGED") {
      return apiError("角色已被其他操作更新，请刷新后重试。", 409);
    }
    if (
      isConstraintViolation(error, "users_role_definition_id_role_definitions_id_fk") ||
      isConstraintViolation(error, "users_role_definition_base_role_fk")
    ) {
      return apiError("该角色刚刚被分配给用户，不能删除。", 409);
    }
    throw error;
  }
}
