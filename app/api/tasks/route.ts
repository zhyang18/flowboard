import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, projects, sprints, tasks, users } from "@/db/schema";
import { apiError, textValue } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import {
  isTaskPriority,
  isTaskStatus,
  parseDate,
  safeHours,
  serializeTask,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? "";
  const assigneeId = searchParams.get("assigneeId") ?? "";
  const query = searchParams.get("query")?.trim().slice(0, 80) ?? "";
  const conditions: SQL[] = [eq(projects.archived, false)];

  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (assigneeId) conditions.push(eq(tasks.assigneeId, assigneeId));
  if (query) {
    const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(
      or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))!,
    );
  }

  const db = getDb();
  const [taskRows, projectRows, assigneeRows] = await Promise.all([
    db
      .select({
        task: tasks,
        projectName: projects.name,
        projectCode: projects.code,
        projectColor: projects.color,
        assigneeName: users.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(...conditions))
      .orderBy(asc(tasks.status), asc(tasks.sortOrder), desc(tasks.updatedAt)),
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
  ]);

  return NextResponse.json({
    data: taskRows.map((row) => ({
      ...serializeTask(row.task),
      projectName: row.projectName,
      projectCode: row.projectCode,
      projectColor: row.projectColor,
      assigneeName: row.assigneeName,
    })),
    projects: projectRows,
    assignees: assigneeRows,
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

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const title = textValue(body.title, 160);
  const description = textValue(body.description, 1500);
  const status = isTaskStatus(body.status) ? body.status : "backlog";
  const priority = isTaskPriority(body.priority) ? body.priority : "medium";
  const assigneeId =
    typeof body.assigneeId === "string" && body.assigneeId
      ? body.assigneeId
      : null;
  const sprintId =
    typeof body.sprintId === "string" && body.sprintId ? body.sprintId : null;
  const dueDate = parseDate(body.dueDate);
  const estimateHours = safeHours(body.estimateHours);
  const actualHours = safeHours(body.actualHours);

  if (!projectId) return apiError("请选择所属项目。");
  if (!title) return apiError("请填写任务标题。");
  if (dueDate === undefined) return apiError("截止日期格式无效。");

  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.archived, false)))
    .limit(1);
  if (!project) return apiError("所属项目不存在。");

  if (assigneeId) {
    const [assignee] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, assigneeId), eq(users.status, "active")))
      .limit(1);
    if (!assignee) return apiError("任务负责人不存在。");
  }

  if (sprintId) {
    const [sprint] = await db
      .select({ id: sprints.id })
      .from(sprints)
      .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, projectId)))
      .limit(1);
    if (!sprint) return apiError("迭代不存在或不属于所选项目。");
  }

  const [order] = await db
    .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), -1) + 1` })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)));

  const [created] = await db
    .insert(tasks)
    .values({
      projectId,
      sprintId,
      title,
      description,
      status,
      priority,
      assigneeId,
      reporterId: currentUser.id,
      estimateHours,
      actualHours,
      sortOrder: Number(order?.value ?? 0),
      dueDate,
      completedAt: status === "done" ? new Date() : null,
    })
    .returning();

  await db.insert(auditLogs).values({
    actorId: currentUser.id,
    action: "task.create",
    entityType: "task",
    entityId: created.id,
    metadata: { title: created.title, projectId: created.projectId },
  });

  return NextResponse.json({ data: serializeTask(created) }, { status: 201 });
}
