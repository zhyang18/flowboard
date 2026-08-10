import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects, tasks, users, workLogs, type UserRole } from "@/db/schema";
import { projectVisibilityCondition } from "@/lib/authorization";
import { apiError } from "@/lib/api";
import {
  buildPeriodTrend,
  countWeekdays,
  dateKeyInTimeZone,
  startOfUtcDay,
} from "@/lib/reporting";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";
import { taskStatusLabels } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 生成当前用户可见项目的交付、工时和成员负载报表。
 *
 * @param request 当前报表请求。
 * @return 口径一致的项目快照和周期工时指标。
 */
export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { searchParams } = new URL(request.url);
  const period = Math.min(365, Math.max(7, Number(searchParams.get("period")) || 30));
  const db = getDb();
  const settings = (await getWorkspaceSettings()) ?? defaultWorkspaceSettings;
  const now = new Date();
  const reportDate = new Date(`${dateKeyInTimeZone(now, settings.timezone)}T00:00:00.000Z`);
  const from = startOfUtcDay(reportDate);
  from.setUTCDate(from.getUTCDate() - period + 1);

  const visibleProjectRows = await db
    .select()
    .from(projects)
    .where(projectVisibilityCondition(currentUser, projects.id))
    .orderBy(asc(projects.name));
  const projectRows = visibleProjectRows.filter((project) => !project.archived);
  const projectIds = projectRows.map((project) => project.id);
  const visibleProjectIds = visibleProjectRows.map((project) => project.id);
  const [taskRows, logRows] = await Promise.all([
    projectIds.length
      ? db
          .select({
            task: tasks,
            projectName: projects.name,
            projectCode: projects.code,
            projectColor: projects.color,
          })
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(inArray(tasks.projectId, projectIds))
      : Promise.resolve([]),
    visibleProjectIds.length
      ? db
          .select({
            id: workLogs.id,
            userId: workLogs.userId,
            userName: users.name,
            userRole: users.role,
            projectId: projects.id,
            durationHours: workLogs.durationHours,
            workDate: workLogs.workDate,
          })
          .from(workLogs)
          .innerJoin(users, eq(workLogs.userId, users.id))
          .innerJoin(tasks, eq(workLogs.taskId, tasks.id))
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(
            and(
              inArray(projects.id, visibleProjectIds),
              gte(workLogs.workDate, from),
            ),
          )
      : Promise.resolve([]),
  ]);

  const total = taskRows.length;
  const done = taskRows.filter(({ task }) => task.status === "done").length;
  const estimate = taskRows.reduce((sum, { task }) => sum + task.estimateHours, 0);
  const actual = taskRows.reduce((sum, { task }) => sum + task.actualHours, 0);
  const overdue = taskRows.filter(
    ({ task }) =>
      task.status !== "done" && task.dueDate && task.dueDate.getTime() < now.getTime(),
  ).length;

  const projectDelivery = projectRows.map((project) => {
    const rows = taskRows.filter(({ task }) => task.projectId === project.id);
    const completed = rows.filter(({ task }) => task.status === "done").length;
    const projectEstimate = rows.reduce((sum, { task }) => sum + task.estimateHours, 0);
    const projectActual = rows.reduce((sum, { task }) => sum + task.actualHours, 0);
    return {
      id: project.id,
      name: project.name,
      code: project.code,
      color: project.color,
      total: rows.length,
      completed,
      testingTaskCount: rows.filter(({ task }) => Boolean(task.testerId)).length,
      awaitingTesterCount: rows.filter(
        ({ task }) => task.status === "review" && !task.testerId,
      ).length,
      progress: rows.length ? Math.round((completed / rows.length) * 100) : 0,
      estimateHours: Math.round(projectEstimate * 10) / 10,
      actualHours: Math.round(projectActual * 10) / 10,
      deviation:
        projectEstimate > 0
          ? Math.round(((projectActual - projectEstimate) / projectEstimate) * 100)
          : 0,
    };
  });

  const memberMap = new Map<
    string,
    { id: string; name: string; role: UserRole; hours: number; projects: Set<string> }
  >();
  for (const log of logRows) {
    const value = memberMap.get(log.userId) ?? {
      id: log.userId,
      name: log.userName,
      role: log.userRole,
      hours: 0,
      projects: new Set<string>(),
    };
    value.hours += log.durationHours;
    value.projects.add(log.projectId);
    memberMap.set(log.userId, value);
  }
  const availableHours = Math.max(1, countWeekdays(from, reportDate) * settings.workdayHours);
  const memberLoad = [...memberMap.values()]
    .map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      hours: Math.round(member.hours * 10) / 10,
      projectCount: member.projects.size,
      utilization: Math.round((member.hours / availableHours) * 100),
    }))
    .sort((a, b) => b.hours - a.hours);

  const statusDistribution = Object.entries(taskStatusLabels).map(([status, label]) => ({
    status,
    label,
    count: taskRows.filter(({ task }) => task.status === status).length,
  }));

  return NextResponse.json({
    period,
    stats: {
      projectCount: projectRows.length,
      taskCount: total,
      completionRate: total ? Math.round((done / total) * 100) : 0,
      overdue,
      estimateHours: Math.round(estimate * 10) / 10,
      actualHours: Math.round(actual * 10) / 10,
      deviation: estimate > 0 ? Math.round(((actual - estimate) / estimate) * 100) : 0,
      loggedHours:
        Math.round(logRows.reduce((sum, log) => sum + log.durationHours, 0) * 10) / 10,
      testingTaskCount: taskRows.filter(({ task }) => Boolean(task.testerId)).length,
      awaitingTesterCount: taskRows.filter(
        ({ task }) => task.status === "review" && !task.testerId,
      ).length,
    },
    projectDelivery,
    memberLoad,
    weekly: buildPeriodTrend(logRows, reportDate, period),
    statusDistribution,
  });
}
