import {
  and,
  asc,
  desc,
  eq,
  gte,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, projects, tasks, users, workLogs } from "@/db/schema";
import { apiError, canManageUsers, textValue } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { parseDate, safeHours } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? "";
  const userId = searchParams.get("userId") ?? "";
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));
  const conditions: SQL[] = [];
  if (projectId) conditions.push(eq(projects.id, projectId));
  if (userId) conditions.push(eq(workLogs.userId, userId));
  if (from instanceof Date) conditions.push(gte(workLogs.workDate, from));
  if (to instanceof Date) {
    const inclusiveTo = new Date(to);
    inclusiveTo.setHours(23, 59, 59, 999);
    conditions.push(lte(workLogs.workDate, inclusiveTo));
  }

  const db = getDb();
  const [rows, projectRows, userRows, taskRows] = await Promise.all([
    db
      .select({
        id: workLogs.id,
        taskId: workLogs.taskId,
        taskTitle: tasks.title,
        projectId: projects.id,
        projectName: projects.name,
        projectCode: projects.code,
        projectColor: projects.color,
        userId: workLogs.userId,
        userName: users.name,
        workDate: workLogs.workDate,
        durationHours: workLogs.durationHours,
        note: workLogs.note,
        createdAt: workLogs.createdAt,
      })
      .from(workLogs)
      .innerJoin(tasks, eq(workLogs.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(users, eq(workLogs.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(workLogs.workDate), desc(workLogs.createdAt)),
    db
      .select({
        id: projects.id,
        name: projects.name,
        code: projects.code,
        color: projects.color,
      })
      .from(projects)
      .where(eq(projects.archived, false))
      .orderBy(asc(projects.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.status, "active"))
      .orderBy(asc(users.name)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        projectId: tasks.projectId,
      })
      .from(tasks)
      .orderBy(asc(tasks.title)),
  ]);

  return NextResponse.json({
    data: rows.map((row) => ({
      ...row,
      workDate: row.workDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    projects: projectRows,
    users: userRows,
    tasks: taskRows,
    currentUserId: currentUser.id,
    canManage: canManageUsers(currentUser),
  });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const requestedUserId =
    typeof body.userId === "string" && body.userId ? body.userId : currentUser.id;
  const userId = canManageUsers(currentUser) ? requestedUserId : currentUser.id;
  const workDate = parseDate(body.workDate);
  const durationHours = safeHours(body.durationHours);
  const note = textValue(body.note, 500);

  if (!taskId) return apiError("请选择任务。");
  if (!workDate || workDate === undefined) return apiError("请选择有效的工作日期。");
  if (durationHours <= 0 || durationHours > 24) {
    return apiError("单条工时必须大于 0 且不超过 24 小时。");
  }

  const db = getDb();
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) return apiError("任务不存在。");

  const [created] = await db.transaction(async (tx) => {
    const result = await tx
      .insert(workLogs)
      .values({ taskId, userId, workDate, durationHours, note })
      .returning();
    await tx
      .update(tasks)
      .set({
        actualHours: sql`${tasks.actualHours} + ${durationHours}`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "work_log.create",
      entityType: "work_log",
      entityId: result[0].id,
      metadata: { taskId, userId, durationHours },
    });
    return result;
  });

  return NextResponse.json(
    {
      data: {
        ...created,
        workDate: created.workDate.toISOString(),
        createdAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
