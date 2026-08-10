import { and, desc, eq, ne, or, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects, tasks } from "@/db/schema";
import { projectVisibilityCondition } from "@/lib/authorization";
import { buildTaskNotifications } from "@/lib/notifications";
import { apiError } from "@/lib/api";
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

  const [settings, taskRows] = await Promise.all([
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
  ]);
  const resolvedSettings = settings ?? defaultWorkspaceSettings;
  const notifications = buildTaskNotifications(taskRows, {
    now: new Date(),
    notifyOverdue: resolvedSettings.notifyOverdue,
    timeZone: resolvedSettings.timezone,
  });

  return NextResponse.json({
    data: notifications.slice(0, 8),
    count: notifications.length,
    generatedAt: new Date().toISOString(),
  });
}
