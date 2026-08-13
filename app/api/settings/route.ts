import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, workspaceSettings } from "@/db/schema";
import { apiError, canManageUsers, textValue } from "@/lib/api";
import {
  formatStorageBytes,
  NEON_FREE_STORAGE_LIMIT_BYTES,
  remainingStorageBytes,
} from "@/lib/database-usage";
import { defaultWorkspaceSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";
import { hasTrustedOrigin } from "@/lib/request-security";
import { safeHours } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 获取工作空间设置和当前用户的维护权限。
 *
 * @return 工作空间设置。
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const db = getDb();
  const [[settings], databaseUsageRows] = await Promise.all([
    db.select().from(workspaceSettings).limit(1),
    db.execute<{ databaseBytes: string }>(
      sql`select pg_database_size(current_database())::text as "databaseBytes"`,
    ),
  ]);
  const databaseBytes = Number(databaseUsageRows[0]?.databaseBytes ?? 0);
  return NextResponse.json({
    data: settings
      ? {
          ...settings,
          createdAt: settings.createdAt.toISOString(),
          updatedAt: settings.updatedAt.toISOString(),
        }
      : defaultWorkspaceSettings,
    canManage: canManageUsers(currentUser),
    databaseCapacity: {
      used: formatStorageBytes(databaseBytes),
      remaining: formatStorageBytes(remainingStorageBytes(databaseBytes)),
      total: formatStorageBytes(NEON_FREE_STORAGE_LIMIT_BYTES),
    },
  });
}

/**
 * 校验并保存工作空间级工时与任务规则。
 *
 * @param request 当前设置更新请求。
 * @return 保存后的工作空间设置。
 */
export async function PUT(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权修改工作空间设置。", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const workspaceName = textValue(body.workspaceName, 80);
  const timezone = textValue(body.timezone, 60);
  const weekStart = Number(body.weekStart) === 0 ? 0 : 1;
  const defaultEstimateHours = safeHours(body.defaultEstimateHours);
  const workdayHours = safeHours(body.workdayHours);

  if (!workspaceName) return apiError("工作空间名称不能为空。");
  if (!timezone) return apiError("请选择时区。");
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: timezone }).format();
  } catch {
    return apiError("请选择有效的 IANA 时区。");
  }
  if (defaultEstimateHours <= 0 || workdayHours <= 0 || workdayHours > 24) {
    return apiError("默认预估和每日工时必须大于 0，每日工时不能超过 24 小时。");
  }

  const values = {
    workspaceName,
    timezone,
    weekStart,
    defaultEstimateHours,
    workdayHours,
    requireEstimate: body.requireEstimate !== false,
    autoCompleteTimestamp: body.autoCompleteTimestamp !== false,
    notifyOverdue: body.notifyOverdue !== false,
    updatedAt: new Date(),
  };

  const db = getDb();
  const saved = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(workspaceSettings).limit(1);
    const [record] = existing
      ? await tx
          .update(workspaceSettings)
          .set(values)
          .where(eq(workspaceSettings.id, existing.id))
          .returning()
      : await tx.insert(workspaceSettings).values(values).returning();
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "settings.update",
      entityType: "workspace_settings",
      entityId: record.id,
      metadata: { changedFields: Object.keys(body) },
    });
    return record;
  });

  return NextResponse.json({
    data: {
      ...saved,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    },
  });
}
