import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  auditLogs,
  projectMembers,
  projects,
  sprints,
  tasks,
  users,
} from "@/db/schema";
import {
  canContributeToProject,
  canEditTask,
  canManageProject,
  getProjectAccess,
  projectVisibilityCondition,
} from "@/lib/authorization";
import { apiError, textValue } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";
import {
  isTaskPriority,
  isTaskStatus,
  parseDate,
  safeHours,
  serializeTask,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 获取当前用户可见的任务、项目和按项目约束的负责人选项。
 *
 * @param request 当前任务查询请求。
 * @return 任务看板数据及服务端计算的操作权限。
 */
export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? "";
  const assigneeId = searchParams.get("assigneeId") ?? "";
  const query = searchParams.get("query")?.trim().slice(0, 80) ?? "";
  const conditions: SQL[] = [
    eq(projects.archived, false),
    projectVisibilityCondition(currentUser, tasks.projectId),
  ];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (assigneeId) conditions.push(eq(tasks.assigneeId, assigneeId));
  if (query) {
    const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))!);
  }

  const db = getDb();
  const settings = (await getWorkspaceSettings()) ?? defaultWorkspaceSettings;
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      color: projects.color,
      ownerId: projects.ownerId,
      archived: projects.archived,
    })
    .from(projects)
    .where(
      and(
        eq(projects.archived, false),
        projectVisibilityCondition(currentUser, projects.id),
      ),
    )
    .orderBy(asc(projects.name));
  const projectIds = projectRows.map((project) => project.id);

  const [taskRows, memberRows, currentMembershipRows] = await Promise.all([
    db
      .select({
        task: tasks,
        projectName: projects.name,
        projectCode: projects.code,
        projectColor: projects.color,
        assigneeName: users.name,
        overdue: sql<boolean>`${tasks.status} <> 'done' and ${tasks.dueDate} < now()`,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(...conditions))
      .orderBy(asc(tasks.status), asc(tasks.sortOrder), desc(tasks.updatedAt)),
    projectIds.length
      ? db
          .select({
            projectId: projectMembers.projectId,
            userId: users.id,
            name: users.name,
            role: projectMembers.role,
          })
          .from(projectMembers)
          .innerJoin(users, eq(projectMembers.userId, users.id))
          .where(
            and(
              inArray(projectMembers.projectId, projectIds),
              eq(users.status, "active"),
            ),
          )
          .orderBy(asc(users.name))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({ projectId: projectMembers.projectId, role: projectMembers.role })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.userId, currentUser.id),
              inArray(projectMembers.projectId, projectIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const membershipMap = new Map(
    currentMembershipRows.map((member) => [member.projectId, member.role]),
  );
  const projectMap = new Map(projectRows.map((project) => [project.id, project]));
  const accessForProject = (id: string) => {
    const project = projectMap.get(id);
    return project
      ? {
          projectId: project.id,
          ownerId: project.ownerId,
          archived: project.archived,
          memberRole: membershipMap.get(project.id) ?? null,
        }
      : null;
  };
  const assigneeMap = new Map<string, { id: string; name: string; projectIds: string[] }>();
  for (const member of memberRows) {
    if (member.role === "viewer") continue;
    const value = assigneeMap.get(member.userId) ?? {
      id: member.userId,
      name: member.name,
      projectIds: [],
    };
    value.projectIds.push(member.projectId);
    assigneeMap.set(member.userId, value);
  }

  return NextResponse.json({
    data: taskRows.map((row) => {
      const access = accessForProject(row.task.projectId);
      return {
        ...serializeTask(row.task),
        projectName: row.projectName,
        projectCode: row.projectCode,
        projectColor: row.projectColor,
        assigneeName: row.assigneeName,
        overdue: row.overdue,
        canEdit: canEditTask(currentUser, access, row.task),
        canManageProject: canManageProject(currentUser, access),
        canDelete:
          canManageProject(currentUser, access) || row.task.reporterId === currentUser.id,
      };
    }),
    projects: projectRows.map(({ ownerId, archived, ...project }) => ({
      ...project,
      canCreateTask: canContributeToProject(currentUser, {
        projectId: project.id,
        ownerId,
        archived,
        memberRole: membershipMap.get(project.id) ?? null,
      }),
      canManage: canManageProject(currentUser, {
        projectId: project.id,
        ownerId,
        archived,
        memberRole: membershipMap.get(project.id) ?? null,
      }),
    })),
    assignees: [...assigneeMap.values()],
    canCreate: projectRows.some((project) =>
      canContributeToProject(currentUser, accessForProject(project.id)),
    ),
    defaultEstimateHours: settings.defaultEstimateHours,
  });
}

/**
 * 创建任务并保证项目、迭代、负责人和当前用户的项目关系有效。
 *
 * @param request 当前创建任务请求。
 * @return 创建后的任务记录。
 */
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
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
    typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
  const sprintId = typeof body.sprintId === "string" && body.sprintId ? body.sprintId : null;
  const dueDate = parseDate(body.dueDate);
  const estimateHours = safeHours(body.estimateHours);

  if (!projectId) return apiError("请选择所属项目。");
  if (!title) return apiError("请填写任务标题。");
  if (dueDate === undefined) return apiError("截止日期格式无效。");
  const access = await getProjectAccess(currentUser, projectId);
  if (!access || access.archived) return apiError("所属项目不存在。", 404);
  if (!canContributeToProject(currentUser, access)) {
    return apiError("无权在该项目中创建任务。", 403);
  }

  const settings = (await getWorkspaceSettings()) ?? defaultWorkspaceSettings;
  if (settings.requireEstimate && estimateHours <= 0) {
    return apiError("当前工作空间要求任务填写预估工时。");
  }

  const db = getDb();
  if (assigneeId) {
    const [assignee] = await db
      .select({ id: users.id })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, assigneeId),
          eq(users.status, "active"),
          sql`${projectMembers.role} <> 'viewer'`,
        ),
      )
      .limit(1);
    if (!assignee) return apiError("任务负责人必须是该项目的有效成员。");
  }

  if (sprintId) {
    const [sprint] = await db
      .select({ id: sprints.id })
      .from(sprints)
      .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, projectId)))
      .limit(1);
    if (!sprint) return apiError("迭代不存在或不属于所选项目。");
  }

  const created = await db.transaction(async (tx) => {
    const [order] = await tx
      .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), -1) + 1` })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)));
    const [task] = await tx
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
        actualHours: 0,
        sortOrder: Number(order?.value ?? 0),
        dueDate,
        completedAt:
          status === "done" && settings.autoCompleteTimestamp ? new Date() : null,
      })
      .returning();
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "task.create",
      entityType: "task",
      entityId: task.id,
      metadata: { title: task.title, projectId: task.projectId },
    });
    return task;
  });

  return NextResponse.json({ data: serializeTask(created) }, { status: 201 });
}
