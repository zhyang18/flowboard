import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  auditLogs,
  projectMembers,
  projects,
  tasks,
  users,
  workLogs,
} from "@/db/schema";
import {
  canContributeToProject,
  canManageProject,
  getProjectAccess,
  projectVisibilityCondition,
} from "@/lib/authorization";
import { apiError, textValue } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { dateKeyInTimeZone, startOfUtcDay } from "@/lib/reporting";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";
import { parseDate, safeHours } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 返回某一天的 UTC 结束时间，用于与日期输入保持一致。
 *
 * @param value 当天的 UTC 起始时间。
 * @return 当天 23:59:59.999 的时间。
 */
function endOfUtcDay(value: Date): Date {
  const result = new Date(value);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

/**
 * 获取当前用户可见的工时流水及项目、成员、任务选项。
 *
 * @param request 当前工时查询请求。
 * @return 工时明细、筛选选项和逐条操作权限。
 */
export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? "";
  const userId = searchParams.get("userId") ?? "";
  const fromValue = searchParams.get("from");
  const toValue = searchParams.get("to");
  const from = parseDate(fromValue);
  const to = parseDate(toValue);
  if ((fromValue && from === undefined) || (toValue && to === undefined)) {
    return apiError("工时筛选日期格式无效。");
  }
  if (from instanceof Date && to instanceof Date && from > to) {
    return apiError("开始日期不能晚于结束日期。");
  }

  const conditions: SQL[] = [projectVisibilityCondition(currentUser, projects.id)];
  if (projectId) conditions.push(eq(projects.id, projectId));
  if (userId) conditions.push(eq(workLogs.userId, userId));
  if (from instanceof Date) conditions.push(gte(workLogs.workDate, from));
  if (to instanceof Date) conditions.push(lte(workLogs.workDate, endOfUtcDay(to)));

  const db = getDb();
  const visibleProjectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      color: projects.color,
      ownerId: projects.ownerId,
      archived: projects.archived,
    })
    .from(projects)
    .where(projectVisibilityCondition(currentUser, projects.id))
    .orderBy(asc(projects.name));
  const activeProjectRows = visibleProjectRows.filter((project) => !project.archived);
  const activeProjectIds = activeProjectRows.map((project) => project.id);

  const [rows, memberRows, taskRows, currentMembershipRows] = await Promise.all([
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
      .where(and(...conditions))
      .orderBy(desc(workLogs.workDate), desc(workLogs.createdAt)),
    activeProjectIds.length
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
              inArray(projectMembers.projectId, activeProjectIds),
              eq(users.status, "active"),
            ),
          )
          .orderBy(asc(users.name))
      : Promise.resolve([]),
    activeProjectIds.length
      ? db
          .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId })
          .from(tasks)
          .where(inArray(tasks.projectId, activeProjectIds))
          .orderBy(asc(tasks.title))
      : Promise.resolve([]),
    visibleProjectRows.length
      ? db
          .select({ projectId: projectMembers.projectId, role: projectMembers.role })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.userId, currentUser.id),
              inArray(
                projectMembers.projectId,
                visibleProjectRows.map((project) => project.id),
              ),
            ),
          )
      : Promise.resolve([]),
  ]);

  const membershipMap = new Map(
    currentMembershipRows.map((member) => [member.projectId, member.role]),
  );
  const accessMap = new Map(
    visibleProjectRows.map((project) => [
      project.id,
      {
        projectId: project.id,
        ownerId: project.ownerId,
        archived: project.archived,
        memberRole: membershipMap.get(project.id) ?? null,
      },
    ]),
  );
  const userMap = new Map<string, { id: string; name: string; projectIds: string[] }>();
  for (const member of memberRows) {
    if (member.role === "viewer") continue;
    const value = userMap.get(member.userId) ?? {
      id: member.userId,
      name: member.name,
      projectIds: [],
    };
    value.projectIds.push(member.projectId);
    userMap.set(member.userId, value);
  }

  return NextResponse.json({
    data: rows.map((row) => ({
      ...row,
      workDate: row.workDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
      canDelete:
        row.userId === currentUser.id ||
        canManageProject(currentUser, accessMap.get(row.projectId) ?? null),
    })),
    projects: activeProjectRows.map(({ ownerId, archived, ...project }) => ({
      ...project,
      canLog: canContributeToProject(currentUser, {
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
    users: [...userMap.values()],
    tasks: taskRows,
    currentUserId: currentUser.id,
    canCreate: activeProjectRows.some((project) =>
      canContributeToProject(currentUser, accessMap.get(project.id) ?? null),
    ),
  });
}

/**
 * 登记工时并以原子累加方式同步任务实际工时。
 *
 * @param request 当前工时登记请求。
 * @return 新建的工时记录。
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

  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const requestedUserId =
    typeof body.userId === "string" && body.userId ? body.userId : currentUser.id;
  const parsedWorkDate = parseDate(body.workDate);
  const workDate = parsedWorkDate instanceof Date ? startOfUtcDay(parsedWorkDate) : parsedWorkDate;
  const durationHours = safeHours(body.durationHours);
  const note = textValue(body.note, 500);
  if (!taskId) return apiError("请选择任务。");
  if (!(workDate instanceof Date)) return apiError("请选择有效的工作日期。");
  const settings = (await getWorkspaceSettings()) ?? defaultWorkspaceSettings;
  const workDateKey = workDate.toISOString().slice(0, 10);
  if (workDateKey > dateKeyInTimeZone(new Date(), settings.timezone)) {
    return apiError("不能登记未来日期的工时。");
  }
  if (durationHours <= 0 || durationHours > 24) {
    return apiError("单条工时必须大于 0 且不超过 24 小时。");
  }

  const db = getDb();
  const [task] = await db
    .select({ id: tasks.id, projectId: tasks.projectId, archived: projects.archived })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) return apiError("任务不存在。", 404);
  const access = await getProjectAccess(currentUser, task.projectId);
  if (!access || task.archived) return apiError("任务不存在。", 404);
  if (!canContributeToProject(currentUser, access)) {
    return apiError("无权在该项目中登记工时。", 403);
  }
  if (requestedUserId !== currentUser.id && !canManageProject(currentUser, access)) {
    return apiError("只有项目负责人可以代成员登记工时。", 403);
  }

  const [targetUser] = await db
    .select({ id: users.id })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(
      and(
        eq(projectMembers.projectId, task.projectId),
        eq(projectMembers.userId, requestedUserId),
        eq(users.status, "active"),
        sql`${projectMembers.role} <> 'viewer'`,
      ),
    )
    .limit(1);
  if (!targetUser) return apiError("工时成员必须是该项目的有效成员。");

  const [dailyTotal] = await db
    .select({ hours: sql<number>`coalesce(sum(${workLogs.durationHours}), 0)` })
    .from(workLogs)
    .where(
      and(
        eq(workLogs.userId, requestedUserId),
        gte(workLogs.workDate, workDate),
        lte(workLogs.workDate, endOfUtcDay(workDate)),
      ),
    );
  if (Number(dailyTotal?.hours ?? 0) + durationHours > 24) {
    return apiError("该成员当天累计工时不能超过 24 小时。");
  }

  try {
    const created = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${requestedUserId}:${workDate.toISOString().slice(0, 10)}`}))`,
      );
      const [lockedDailyTotal] = await tx
        .select({ hours: sql<number>`coalesce(sum(${workLogs.durationHours}), 0)` })
        .from(workLogs)
        .where(
          and(
            eq(workLogs.userId, requestedUserId),
            gte(workLogs.workDate, workDate),
            lte(workLogs.workDate, endOfUtcDay(workDate)),
          ),
        );
      if (Number(lockedDailyTotal?.hours ?? 0) + durationHours > 24) {
        throw new Error("DAILY_HOURS_LIMIT");
      }

      const [record] = await tx
        .insert(workLogs)
        .values({
          taskId,
          userId: requestedUserId,
          workDate,
          durationHours,
          note,
        })
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
        entityId: record.id,
        metadata: { taskId, userId: requestedUserId, durationHours },
      });
      return record;
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
  } catch (error) {
    if (error instanceof Error && error.message === "DAILY_HOURS_LIMIT") {
      return apiError("该成员当天累计工时不能超过 24 小时。");
    }
    throw error;
  }
}
