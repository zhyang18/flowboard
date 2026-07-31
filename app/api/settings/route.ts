import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, workspaceSettings } from "@/db/schema";
import { apiError, canManageUsers, textValue } from "@/lib/api";
import { defaultWorkspaceSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";
import { safeHours } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const [settings] = await getDb().select().from(workspaceSettings).limit(1);
  return NextResponse.json({
    data: settings
      ? {
          ...settings,
          createdAt: settings.createdAt.toISOString(),
          updatedAt: settings.updatedAt.toISOString(),
        }
      : defaultWorkspaceSettings,
    canManage: canManageUsers(currentUser),
  });
}

export async function PUT(request: Request) {
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
  const [existing] = await db.select().from(workspaceSettings).limit(1);
  const [saved] = existing
    ? await db
        .update(workspaceSettings)
        .set(values)
        .where(eq(workspaceSettings.id, existing.id))
        .returning()
    : await db.insert(workspaceSettings).values(values).returning();

  await db.insert(auditLogs).values({
    actorId: currentUser.id,
    action: "settings.update",
    entityType: "workspace_settings",
    entityId: saved.id,
    metadata: { changedFields: Object.keys(body) },
  });

  return NextResponse.json({
    data: {
      ...saved,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    },
  });
}
