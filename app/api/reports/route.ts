import { asc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects, tasks, users, workLogs } from "@/db/schema";
import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { taskStatusLabels } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportReferenceTime = Date.now();

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { searchParams } = new URL(request.url);
  const period = Math.min(
    365,
    Math.max(7, Number(searchParams.get("period")) || 30),
  );
  const from = new Date(reportReferenceTime - period * 24 * 60 * 60 * 1000);
  const db = getDb();

  const [projectRows, taskRows, logRows] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(eq(projects.archived, false))
      .orderBy(asc(projects.name)),
    db
      .select({
        task: tasks,
        projectName: projects.name,
        projectCode: projects.code,
        projectColor: projects.color,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(projects.archived, false)),
    db
      .select({
        id: workLogs.id,
        userId: workLogs.userId,
        userName: users.name,
        projectId: projects.id,
        durationHours: workLogs.durationHours,
        workDate: workLogs.workDate,
      })
      .from(workLogs)
      .innerJoin(users, eq(workLogs.userId, users.id))
      .innerJoin(tasks, eq(workLogs.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(gte(workLogs.workDate, from)),
  ]);

  const total = taskRows.length;
  const done = taskRows.filter(({ task }) => task.status === "done").length;
  const estimate = taskRows.reduce(
    (sum, { task }) => sum + task.estimateHours,
    0,
  );
  const actual = taskRows.reduce((sum, { task }) => sum + task.actualHours, 0);
  const overdue = taskRows.filter(
    ({ task }) =>
      task.status !== "done" &&
      task.dueDate &&
      task.dueDate.getTime() < reportReferenceTime,
  ).length;

  const projectDelivery = projectRows.map((project) => {
    const rows = taskRows.filter(({ task }) => task.projectId === project.id);
    const completed = rows.filter(({ task }) => task.status === "done").length;
    const projectEstimate = rows.reduce(
      (sum, { task }) => sum + task.estimateHours,
      0,
    );
    const projectActual = rows.reduce(
      (sum, { task }) => sum + task.actualHours,
      0,
    );
    return {
      id: project.id,
      name: project.name,
      code: project.code,
      color: project.color,
      total: rows.length,
      completed,
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
    { id: string; name: string; hours: number; projects: Set<string> }
  >();
  for (const log of logRows) {
    const value = memberMap.get(log.userId) ?? {
      id: log.userId,
      name: log.userName,
      hours: 0,
      projects: new Set<string>(),
    };
    value.hours += log.durationHours;
    value.projects.add(log.projectId);
    memberMap.set(log.userId, value);
  }
  const memberLoad = [...memberMap.values()]
    .map((member) => ({
      id: member.id,
      name: member.name,
      hours: Math.round(member.hours * 10) / 10,
      projectCount: member.projects.size,
      utilization: Math.min(
        100,
        Math.round((member.hours / ((period / 7) * 40)) * 100),
      ),
    }))
    .sort((a, b) => b.hours - a.hours);

  const weekMap = new Map<string, number>();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const start = new Date(reportReferenceTime - offset * 7 * 24 * 60 * 60 * 1000);
    const key = `${start.getMonth() + 1}/${start.getDate()}`;
    weekMap.set(key, 0);
  }
  for (const log of logRows) {
    let bestKey: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const key of weekMap.keys()) {
      const [month, day] = key.split("/").map(Number);
      const marker = new Date(new Date().getFullYear(), month - 1, day);
      const distance = log.workDate.getTime() - marker.getTime();
      if (distance >= 0 && distance < 7 * 24 * 60 * 60 * 1000 && distance < bestDistance) {
        bestKey = key;
        bestDistance = distance;
      }
    }
    if (bestKey) weekMap.set(bestKey, (weekMap.get(bestKey) ?? 0) + log.durationHours);
  }

  const statusDistribution = Object.entries(taskStatusLabels).map(
    ([status, label]) => ({
      status,
      label,
      count: taskRows.filter(({ task }) => task.status === status).length,
    }),
  );

  return NextResponse.json({
    period,
    stats: {
      projectCount: projectRows.length,
      taskCount: total,
      completionRate: total ? Math.round((done / total) * 100) : 0,
      overdue,
      estimateHours: Math.round(estimate * 10) / 10,
      actualHours: Math.round(actual * 10) / 10,
      deviation:
        estimate > 0 ? Math.round(((actual - estimate) / estimate) * 100) : 0,
      loggedHours: Math.round(
        logRows.reduce((sum, log) => sum + log.durationHours, 0) * 10,
      ) / 10,
    },
    projectDelivery,
    memberLoad,
    weekly: [...weekMap.entries()].map(([label, hours]) => ({
      label,
      hours: Math.round(hours * 10) / 10,
    })),
    statusDistribution,
  });
}
