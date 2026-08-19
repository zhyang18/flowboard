import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, customRoles } from "@/db/schema";
import { apiError } from "@/lib/api";
import { canManageUsers } from "@/lib/authorization";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getAllRoles, validateRoleInput } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 获取所有角色列表及各角色的成员数统计。
 *
 * @return 包含角色列表的 JSON 响应。
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权查看角色权限列表。", 403);

  try {
    const db = getDb();
    const roles = await getAllRoles(db);
    return NextResponse.json({ data: roles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取角色列表失败。";
    return apiError(message, 500);
  }
}

/**
 * 创建新的自定义角色。
 *
 * @param request HTTP 请求对象，包含角色名称、描述、色调和权限配置。
 * @return 创建后的角色信息或错误响应。
 */
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (currentUser.role !== "super_admin") return apiError("只有超级管理员可以创建角色。", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const validationError = validateRoleInput(body);
  if (validationError) return apiError(validationError, 400);

  const name = (body.name as string).trim();
  const description = ((body.description as string) || "").trim();
  const tone = (body.tone as string) || "blue";
  const permissions = Array.isArray(body.permissions)
    ? (body.permissions as boolean[])
    : [false, false, false, false, false, false];

  const db = getDb();
  const roleId = `custom_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const [created] = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(customRoles)
        .values({
          id: roleId,
          name,
          description,
          tone,
          permissions,
          isSystem: false,
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "role.create",
        entityType: "role",
        entityId: roleId,
        metadata: { name, tone, permissions },
      });

      return [inserted];
    });

    return NextResponse.json(
      {
        data: {
          id: created.id,
          name: created.name,
          description: created.description,
          tone: created.tone,
          permissions: created.permissions,
          isSystem: created.isSystem,
          userCount: 0,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建角色失败。";
    return apiError(message, 500);
  }
}
