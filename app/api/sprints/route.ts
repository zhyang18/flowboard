import { asc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, projects, sprints, tasks } from "@/db/schema";
import { apiError, canManageUsers, textValue } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import {
  isSprintStatus,
  parseDate,
  safeHours,
  serializeSprint,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const db = getDb();
  const sprintRows = await db
    .select({
      sprint: sprints,
      projectName: projects.name,
      projectCode: projects.code,
      projectColor: projects.color,
    })
    .from(sprints)
    .innerJoin(projects, eq(sprints.projectId, projects.id))
    .where(eq(projects.archived, false))
    .orderBy(asc(sprints.startDate));

  const sprintIds = sprintRows.map(({ sprint }) => sprint.id);
  const taskRows = sprintIds.length
    ? await db
        .select({
          id: tasks.id,
          sprintId: tasks.sprintId,
          title: tasks.title,
          status: tasks.status,
          estimateHours: tasks.estimateHours,
          actualHours: tasks.actualHours,
        })
        .from(tasks)
        .where(isNotNull(tasks.sprintId))
    : [];
  const validTaskRows = taskRows.filter(
    (task) => task.sprintId && sprintIds.includes(task.sprintId),
  );

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      color: projects.color,
    })
    .from(projects)
    .where(eq(projects.archived, false))
    .orderBy(asc(projects.name));

  return NextResponse.json({
    data: sprintRows.map(({ sprint, ...project }) => {
      const sprintTasks = validTaskRows.filter(
        (task) => task.sprintId === sprint.id,
      );
      const done = sprintTasks.filter((task) => task.status === "done").length;
      const estimate = sprintTasks.reduce(
        (sum, task) => sum + task.estimateHours,
        0,
      );
      const actual = sprintTasks.reduce(
        (sum, task) => sum + task.actualHours,
        0,
      );
      return {
        ...serializeSprint(sprint),
        ...project,
        taskCount: sprintTasks.length,
        completedTaskCount: done,
        progress: sprintTasks.length
          ? Math.round((done / sprintTasks.length) * 100)
          : 0,
        estimateHours: Math.round(estimate * 10) / 10,
        actualHours: Math.round(actual * 10) / 10,
        tasks: sprintTasks,
      };
    }),
    projects: projectRows,
  });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权创建迭代。", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const name = textValue(body.name, 80);
  const goal = textValue(body.goal, 500);
  const status = isSprintStatus(body.status) ? body.status : "planned";
  const capacityHours = safeHours(body.capacityHours);
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);

  if (!projectId || !name) return apiError("请选择项目并填写迭代名称。");
  if (!startDate || !endDate || startDate === undefined || endDate === undefined) {
    return apiError("请填写有效的迭代周期。");
  }
  if (endDate < startDate) return apiError("结束日期不能早于开始日期。");

  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return apiError("所属项目不存在。");

  const [created] = await db
    .insert(sprints)
    .values({
      projectId,
      name,
      goal,
      status,
      capacityHours,
      startDate,
      endDate,
    })
    .returning();

  await db.insert(auditLogs).values({
    actorId: currentUser.id,
    action: "sprint.create",
    entityType: "sprint",
    entityId: created.id,
    metadata: { name: created.name, projectId: created.projectId },
  });

  return NextResponse.json({ data: serializeSprint(created) }, { status: 201 });
}
