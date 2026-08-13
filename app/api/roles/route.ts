import { randomUUID } from "node:crypto";
import { asc, count, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, roleDefinitions, users } from "@/db/schema";
import { apiError } from "@/lib/api";
import { canManageUsers } from "@/lib/authorization";
import { hasTrustedOrigin } from "@/lib/request-security";
import { parseRoleDefinitionInput } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 查询角色权限定义及其实际分配人数。
 *
 * @return 当前组织的角色定义列表。
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权查看角色权限。", 403);

  const db = getDb();
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(roleDefinitions)
      .orderBy(desc(roleDefinitions.isSystem), asc(roleDefinitions.createdAt)),
    db
      .select({ roleDefinitionId: users.roleDefinitionId, value: count() })
      .from(users)
      .groupBy(users.roleDefinitionId),
  ]);
  const countByRole = new Map(
    countRows.map((item) => [item.roleDefinitionId, Number(item.value)]),
  );

  return NextResponse.json({
    data: rows.map((role) => ({
      ...role,
      userCount: countByRole.get(role.id) ?? 0,
    })),
    canManage: currentUser.role === "super_admin",
  });
}

/**
 * 创建可分配给用户的自定义角色权限定义。
 *
 * @param request 当前创建角色请求。
 * @return 创建后的角色定义。
 */
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (currentUser.role !== "super_admin") {
    return apiError("只有超级管理员可以新增角色。", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  const parsed = parseRoleDefinitionInput(body);
  if (!parsed.data || parsed.error) return apiError(parsed.error ?? "角色数据无效。");
  const data = parsed.data;

  const created = await getDb().transaction(async (tx) => {
    const [role] = await tx
      .insert(roleDefinitions)
      .values({
        ...data,
        code: `custom_${randomUUID().replaceAll("-", "")}`,
      })
      .returning();
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "role.create",
      entityType: "role",
      entityId: role.id,
      metadata: {
        name: role.name,
        baseRole: role.baseRole,
        permissions: role.permissions,
      },
    });
    return role;
  });

  return NextResponse.json({ data: { ...created, userCount: 0 } }, { status: 201 });
}
