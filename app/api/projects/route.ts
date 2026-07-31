import { asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, projects, tasks, users } from "@/db/schema";
import {
  apiError,
  canManageUsers,
  isUniqueViolation,
  textValue,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import {
  isProjectStatus,
  parseDate,
  projectCode,
  serializeProject,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const db = getDb();
  const projectRows = await db
    .select({
      project: projects,
      ownerName: users.name,
    })
    .from(projects)
    .innerJoin(users, eq(projects.ownerId, users.id))
    .where(eq(projects.archived, false))
    .orderBy(asc(projects.createdAt));

  const projectIds = projectRows.map(({ project }) => project.id);
  const taskRows = projectIds.length
    ? await db
        .select({
          projectId: tasks.projectId,
          status: tasks.status,
          estimateHours: tasks.estimateHours,
          actualHours: tasks.actualHours,
        })
        .from(tasks)
        .where(inArray(tasks.projectId, projectIds))
    : [];

  const metrics = new Map<
    string,
    { total: number; done: number; estimate: number; actual: number }
  >();
  for (const task of taskRows) {
    const value = metrics.get(task.projectId) ?? {
      total: 0,
      done: 0,
      estimate: 0,
      actual: 0,
    };
    value.total += 1;
    value.done += task.status === "done" ? 1 : 0;
    value.estimate += task.estimateHours;
    value.actual += task.actualHours;
    metrics.set(task.projectId, value);
  }

  const ownerRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.status, "active"))
    .orderBy(asc(users.name));

  return NextResponse.json({
    data: projectRows.map(({ project, ownerName }) => {
      const value = metrics.get(project.id) ?? {
        total: 0,
        done: 0,
        estimate: 0,
        actual: 0,
      };
      return {
        ...serializeProject(project),
        ownerName,
        taskCount: value.total,
        completedTaskCount: value.done,
        progress: value.total ? Math.round((value.done / value.total) * 100) : 0,
        estimateHours: Math.round(value.estimate * 10) / 10,
        actualHours: Math.round(value.actual * 10) / 10,
      };
    }),
    owners: ownerRows,
  });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权创建项目。", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const name = textValue(body.name, 80);
  const code = projectCode(body.code);
  const description = textValue(body.description, 500);
  const color = /^#[0-9a-f]{6}$/i.test(String(body.color))
    ? String(body.color)
    : "#2f7df6";
  const status = isProjectStatus(body.status) ? body.status : "planning";
  const ownerId =
    typeof body.ownerId === "string" && body.ownerId ? body.ownerId : currentUser.id;
  const startDate = parseDate(body.startDate);
  const dueDate = parseDate(body.dueDate);

  if (!name) return apiError("请填写项目名称。");
  if (!code) return apiError("请填写由字母、数字、横线组成的项目代号。");
  if (startDate === undefined || dueDate === undefined) {
    return apiError("项目日期格式无效。");
  }
  if (startDate && dueDate && dueDate < startDate) {
    return apiError("截止日期不能早于开始日期。");
  }

  const db = getDb();
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);
  if (!owner) return apiError("项目负责人不存在。");

  try {
    const [created] = await db
      .insert(projects)
      .values({
        name,
        code,
        description,
        color,
        status,
        ownerId,
        startDate,
        dueDate,
      })
      .returning();

    await db.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "project.create",
      entityType: "project",
      entityId: created.id,
      metadata: { name: created.name, code: created.code },
    });

    return NextResponse.json({ data: serializeProject(created) }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return apiError("项目代号已存在。", 409);
    throw error;
  }
}
