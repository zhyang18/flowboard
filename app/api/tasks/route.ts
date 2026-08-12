import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  attachments,
  auditLogs,
  projectMembers,
  projects,
  sprints,
  taskRejections,
  tasks,
  users,
} from "@/db/schema";
import {
  canAssignTaskAssignee,
  canAssignTaskTester,
  canChangeTaskStatus,
  canContributeToProject,
  canEditTask,
  canManageProject,
  getProjectAccess,
  projectVisibilityCondition,
} from "@/lib/authorization";
import { apiError, textValue, uuidValue } from "@/lib/api";
import { attachmentDraftToken } from "@/lib/attachments";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";
import {
  isCompletedSprintStatus,
  projectLifecycleLockQueries,
} from "@/lib/sprints";
import {
  isTaskPriority,
  isTaskStatus,
  parseDate,
  safeHours,
  serializeTask,
} from "@/lib/workspace";
import {
  canBackfillCompletedTaskWork,
  canRecordTaskWork,
} from "@/lib/work-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assigneeUsers = alias(users, "assignee_users");
const testerUsers = alias(users, "tester_users");
const rejectionTesters = alias(users, "rejection_testers");

/**
 * 获取当前用户可见的任务、项目以及按项目约束的开发和测试负责人选项。
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
  const testerId = searchParams.get("testerId") ?? "";
  const sprintId = searchParams.get("sprintId") ?? "";
  const requestedTaskId = searchParams.get("taskId");
  const taskId = uuidValue(requestedTaskId);
  const query = searchParams.get("query")?.trim().slice(0, 80) ?? "";
  if (requestedTaskId && !taskId) return apiError("任务 ID 格式无效。");
  const conditions: SQL[] = [
    eq(projects.archived, false),
    projectVisibilityCondition(currentUser, tasks.projectId),
  ];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (assigneeId) conditions.push(eq(tasks.assigneeId, assigneeId));
  if (testerId) conditions.push(eq(tasks.testerId, testerId));
  if (sprintId === "unplanned") conditions.push(isNull(tasks.sprintId));
  else if (sprintId) conditions.push(eq(tasks.sprintId, sprintId));
  if (taskId) conditions.push(eq(tasks.id, taskId));
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

  const [taskRows, memberRows, currentMembershipRows, sprintRows] = await Promise.all([
    db
      .select({
        task: tasks,
        projectName: projects.name,
        projectCode: projects.code,
        projectColor: projects.color,
        assigneeName: assigneeUsers.name,
        testerName: testerUsers.name,
        sprintName: sprints.name,
        sprintStatus: sprints.status,
        overdue: sql<boolean>`${tasks.status} <> 'done' and ${tasks.dueDate} < now()`,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(assigneeUsers, eq(tasks.assigneeId, assigneeUsers.id))
      .leftJoin(testerUsers, eq(tasks.testerId, testerUsers.id))
      .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
      .where(and(...conditions))
      .orderBy(asc(tasks.status), asc(tasks.sortOrder), desc(tasks.updatedAt)),
    projectIds.length
      ? db
          .select({
            projectId: projectMembers.projectId,
            userId: users.id,
            name: users.name,
            role: projectMembers.role,
            userRole: users.role,
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
    projectIds.length
      ? db
          .select({
            id: sprints.id,
            projectId: sprints.projectId,
            name: sprints.name,
            status: sprints.status,
          })
          .from(sprints)
          .where(inArray(sprints.projectId, projectIds))
          .orderBy(asc(sprints.startDate), asc(sprints.name))
      : Promise.resolve([]),
  ]);

  const membershipMap = new Map(
    currentMembershipRows.map((member) => [member.projectId, member.role]),
  );
  const taskIds = taskRows.map((row) => row.task.id);
  const attachmentCountRows = taskIds.length
    ? await db
        .select({ taskId: attachments.taskId, value: count() })
        .from(attachments)
        .where(inArray(attachments.taskId, taskIds))
        .groupBy(attachments.taskId)
    : [];
  const attachmentCountMap = new Map(
    attachmentCountRows.map((item) => [item.taskId, Number(item.value)]),
  );
  const rejectionRows = taskIds.length
    ? await db
        .select({
          id: taskRejections.id,
          taskId: taskRejections.taskId,
          reason: taskRejections.reason,
          testerName: rejectionTesters.name,
          createdAt: taskRejections.createdAt,
        })
        .from(taskRejections)
        .innerJoin(rejectionTesters, eq(taskRejections.testerId, rejectionTesters.id))
        .where(inArray(taskRejections.taskId, taskIds))
        .orderBy(desc(taskRejections.createdAt))
    : [];
  const latestRejectionMap = new Map<
    string,
    (typeof rejectionRows)[number]
  >();
  for (const rejection of rejectionRows) {
    if (!latestRejectionMap.has(rejection.taskId)) {
      latestRejectionMap.set(rejection.taskId, rejection);
    }
  }
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
  const testerMap = new Map<string, { id: string; name: string; projectIds: string[] }>();
  for (const member of memberRows) {
    if (
      (member.role === "member" || member.role === "manager") &&
      member.userRole !== "tester" &&
      member.userRole !== "viewer"
    ) {
      const value = assigneeMap.get(member.userId) ?? {
        id: member.userId,
        name: member.name,
        projectIds: [],
      };
      value.projectIds.push(member.projectId);
      assigneeMap.set(member.userId, value);
    }
    if (member.role === "tester" && member.userRole === "tester") {
      const value = testerMap.get(member.userId) ?? {
        id: member.userId,
        name: member.name,
        projectIds: [],
      };
      value.projectIds.push(member.projectId);
      testerMap.set(member.userId, value);
    }
  }

  return NextResponse.json({
    data: taskRows.map((row) => {
      const access = accessForProject(row.task.projectId);
      const latestRejection = latestRejectionMap.get(row.task.id);
      return {
        ...serializeTask(row.task),
        projectName: row.projectName,
        projectCode: row.projectCode,
        projectColor: row.projectColor,
        assigneeName: row.assigneeName,
        testerName: row.testerName,
        sprintName: row.sprintName,
        sprintStatus: row.sprintStatus,
        attachmentCount: attachmentCountMap.get(row.task.id) ?? 0,
        latestRejection: latestRejection
          ? {
              id: latestRejection.id,
              reason: latestRejection.reason,
              testerName: latestRejection.testerName,
              createdAt: latestRejection.createdAt.toISOString(),
            }
          : null,
        overdue: row.overdue,
        canEdit:
          !isCompletedSprintStatus(row.sprintStatus) &&
          canEditTask(currentUser, access, row.task),
        canChangeStatus:
          !isCompletedSprintStatus(row.sprintStatus) &&
          canChangeTaskStatus(currentUser, access, row.task),
        canManageProject: canManageProject(currentUser, access),
        canReject:
          row.task.status === "review" &&
          row.task.testerId === currentUser.id &&
          currentUser.role === "tester" &&
          !isCompletedSprintStatus(row.sprintStatus),
        canLogWork:
          canContributeToProject(currentUser, access) &&
          canRecordTaskWork(currentUser.id, row.task.assigneeId) &&
          (
            !isCompletedSprintStatus(row.sprintStatus) ||
            canBackfillCompletedTaskWork(
              row.sprintStatus,
              row.task.status,
              row.task.actualHours,
              canRecordTaskWork(currentUser.id, row.task.assigneeId),
            )
          ),
        canDelete:
          !isCompletedSprintStatus(row.sprintStatus) &&
          (canManageProject(currentUser, access) || row.task.reporterId === currentUser.id),
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
    testers: [...testerMap.values()],
    sprints: sprintRows,
    currentUserId: currentUser.id,
    currentUserRole: currentUser.role,
    canCreate: projectRows.some((project) =>
      canContributeToProject(currentUser, accessForProject(project.id)),
    ),
    defaultEstimateHours: settings.defaultEstimateHours,
  });
}

/**
 * 创建任务并保证项目、迭代、开发负责人、测试负责人和当前用户的项目关系有效。
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
  const description = textValue(body.description, 10_000);
  const draftToken = attachmentDraftToken(body.attachmentDraftToken);
  const status = isTaskStatus(body.status) ? body.status : "backlog";
  const priority = isTaskPriority(body.priority) ? body.priority : "medium";
  const assigneeId =
    typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
  const requestedTesterId =
    typeof body.testerId === "string" && body.testerId ? body.testerId : null;
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
  if (!canAssignTaskAssignee(currentUser, access, assigneeId)) {
    return apiError("只有项目负责人可以给其他研发成员指派任务。", 403);
  }
  if (!canAssignTaskTester(currentUser, access, requestedTesterId)) {
    return apiError("测试人员创建任务时只能将自己设为测试负责人。", 403);
  }
  const testerId =
    currentUser.role === "tester" && !canManageProject(currentUser, access)
      ? currentUser.id
      : requestedTesterId;
  if (status === "done") {
    return apiError("新建任务后请先登记实际工时，再将任务标记为已完成。", 409);
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
          sql`${projectMembers.role} in ('manager', 'member')`,
          sql`${users.role} not in ('tester', 'viewer')`,
        ),
      )
      .limit(1);
    if (!assignee) return apiError("任务负责人必须是该项目的有效成员。");
  }

  if (testerId) {
    const [tester] = await db
      .select({ id: users.id })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, testerId),
          eq(projectMembers.role, "tester"),
          eq(users.role, "tester"),
          eq(users.status, "active"),
        ),
      )
      .limit(1);
    if (!tester) return apiError("测试负责人必须是该项目的有效测试人员。");
  }

  if (sprintId) {
    const [sprint] = await db
      .select({ id: sprints.id, status: sprints.status })
      .from(sprints)
      .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, projectId)))
      .limit(1);
    if (!sprint) return apiError("迭代不存在或不属于所选项目。");
    if (isCompletedSprintStatus(sprint.status)) {
      return apiError("已完成迭代为历史快照，请先重新打开后再加入任务。", 409);
    }
  }

  try {
    const created = await db.transaction(async (tx) => {
      for (const lockQuery of projectLifecycleLockQueries([projectId])) {
        await tx.execute(lockQuery);
      }
      if (sprintId) {
        const [lockedSprint] = await tx
          .select({ status: sprints.status })
          .from(sprints)
          .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, projectId)))
          .limit(1);
        if (!lockedSprint || isCompletedSprintStatus(lockedSprint.status)) {
          throw new Error("COMPLETED_SPRINT");
        }
      }
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
          testerId,
          reporterId: currentUser.id,
          estimateHours,
          actualHours: 0,
          sortOrder: Number(order?.value ?? 0),
          dueDate,
          completedAt: null,
        })
        .returning();
      if (draftToken) {
        await tx
          .update(attachments)
          .set({ taskId: task.id, draftToken: null })
          .where(
            and(
              eq(attachments.draftToken, draftToken),
              eq(attachments.uploadedBy, currentUser.id),
            ),
          );
      }
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
  } catch (error) {
    if (error instanceof Error && error.message === "COMPLETED_SPRINT") {
      return apiError("已完成迭代为历史快照，请先重新打开后再加入任务。", 409);
    }
    throw error;
  }
}
