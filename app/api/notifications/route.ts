import { and, desc, eq, isNull, ne, or, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { notifications as storedNotifications, projects, tasks } from "@/db/schema";
import { projectVisibilityCondition } from "@/lib/authorization";
import { buildTaskNotifications } from "@/lib/notifications";
import { apiError } from "@/lib/api";
import { attachmentDraftToken } from "@/lib/attachments";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 获取当前用户可处理的任务风险消息。
 *
 * @return 消息列表、待处理总数与生成时间。
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const conditions: SQL[] = [
    eq(projects.archived, false),
    ne(tasks.status, "done"),
    projectVisibilityCondition(currentUser, tasks.projectId),
  ];
  if (currentUser.role !== "super_admin" && currentUser.role !== "project_admin") {
    conditions.push(
      or(
        eq(tasks.assigneeId, currentUser.id),
        eq(tasks.testerId, currentUser.id),
        eq(tasks.reporterId, currentUser.id),
      )!,
    );
  }

  const [settings, taskRows, persistentRows] = await Promise.all([
    getWorkspaceSettings(),
    getDb()
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        projectCode: projects.code,
        dueDate: tasks.dueDate,
        estimateHours: tasks.estimateHours,
        actualHours: tasks.actualHours,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(...conditions))
      .orderBy(desc(tasks.updatedAt))
      .limit(200),
    getDb()
      .select()
      .from(storedNotifications)
      .where(
        and(
          eq(storedNotifications.recipientId, currentUser.id),
          isNull(storedNotifications.readAt),
        ),
      )
      .orderBy(desc(storedNotifications.createdAt))
      .limit(100),
  ]);
  const resolvedSettings = settings ?? defaultWorkspaceSettings;
  const generatedNotifications = buildTaskNotifications(taskRows, {
    now: new Date(),
    notifyOverdue: resolvedSettings.notifyOverdue,
    timeZone: resolvedSettings.timezone,
  });
  const notificationTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: resolvedSettings.timezone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const persistentNotifications = persistentRows.map((item) => ({
    id: item.id,
    kind: "rejected" as const,
    label: "测试未通过",
    title: item.title,
    detail: item.detail,
    timeLabel: notificationTime.format(item.createdAt),
    href: item.href,
    occurredAt: item.createdAt.toISOString(),
    persistent: true,
  }));
  const notifications = [...persistentNotifications, ...generatedNotifications].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );

  return NextResponse.json({
    data: notifications.slice(0, 8),
    count: notifications.length,
    generatedAt: new Date().toISOString(),
  });
}

/**
 * 将当前用户的一条持久化通知标记为已读。
 *
 * @param request 当前通知更新请求。
 * @return 更新成功标记。
 */
export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  const id = attachmentDraftToken(body.id);
  if (!id) return apiError("通知 ID 无效。");
  await getDb()
    .update(storedNotifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(storedNotifications.id, id), eq(storedNotifications.recipientId, currentUser.id)),
    );
  return NextResponse.json({ success: true });
}
