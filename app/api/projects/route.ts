import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  attachments,
  auditLogs,
  projectMembers,
  projects,
  tasks,
  users,
} from "@/db/schema";
import {
  canCreateProjects,
  canManageProject,
  canPermanentlyDeleteProject,
  canRestoreProject,
  projectVisibilityCondition,
} from "@/lib/authorization";
import { apiError, isUniqueViolation, textValue } from "@/lib/api";
import { attachmentDraftToken } from "@/lib/attachments";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { canOwnProject, projectMemberRoleForUser } from "@/lib/users";
import {
  isProjectStatus,
  parseDate,
  projectCode,
  serializeProject,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 解析并去重项目成员 ID，同时确保负责人始终属于项目。
 *
 * @param value 客户端提交的成员 ID 列表。
 * @param ownerId 项目负责人 ID。
 * @return 最多包含 200 个成员的去重 ID 列表。
 */
function parseMemberIds(value: unknown, ownerId: string): string[] {
  const values = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item))
    : [];
  return [...new Set([ownerId, ...values])].slice(0, 200);
}

/**
 * 获取当前用户可见项目及其真实任务、工时和成员关系。
 *
 * @return 项目列表、可选人员及当前用户的创建权限。
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const db = getDb();
  const projectRows = await db
    .select({
      project: projects,
      ownerName: users.name,
      overdue: sql<boolean>`${projects.status} <> 'completed' and ${projects.dueDate} < now()`,
    })
    .from(projects)
    .innerJoin(users, eq(projects.ownerId, users.id))
    .where(projectVisibilityCondition(currentUser, projects.id))
    .orderBy(asc(projects.createdAt));

  const projectIds = projectRows.map(({ project }) => project.id);
  const [taskRows, memberRows, currentMembershipRows, peopleRows, attachmentCountRows] = await Promise.all([
    projectIds.length
      ? db
          .select({
            projectId: tasks.projectId,
            status: tasks.status,
            estimateHours: tasks.estimateHours,
            actualHours: tasks.actualHours,
          })
          .from(tasks)
          .where(inArray(tasks.projectId, projectIds))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({
            projectId: projectMembers.projectId,
            userId: users.id,
            name: users.name,
            role: projectMembers.role,
            status: users.status,
          })
          .from(projectMembers)
          .innerJoin(users, eq(projectMembers.userId, users.id))
          .where(inArray(projectMembers.projectId, projectIds))
          .orderBy(asc(users.name))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({
            projectId: projectMembers.projectId,
            role: projectMembers.role,
          })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.userId, currentUser.id),
              inArray(projectMembers.projectId, projectIds),
            ),
          )
      : Promise.resolve([]),
    db
      .select({ id: users.id, name: users.name, role: users.role, status: users.status })
      .from(users)
      .orderBy(asc(users.name)),
    projectIds.length
      ? db
          .select({ projectId: attachments.projectId, value: count() })
          .from(attachments)
          .where(inArray(attachments.projectId, projectIds))
          .groupBy(attachments.projectId)
      : Promise.resolve([]),
  ]);
  const attachmentCountMap = new Map(
    attachmentCountRows.map((item) => [item.projectId, Number(item.value)]),
  );

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

  const currentMembershipMap = new Map(
    currentMembershipRows.map((member) => [member.projectId, member.role]),
  );
  const canCreate = canCreateProjects(currentUser);
  const canManageAny = projectRows.some(({ project }) =>
    canManageProject(currentUser, {
      projectId: project.id,
      ownerId: project.ownerId,
      archived: project.archived,
      memberRole: currentMembershipMap.get(project.id) ?? null,
    }),
  );
  const memberUserIds = new Set(memberRows.map((member) => member.userId));
  const selectablePeople = peopleRows.filter(
    (person) => person.status === "active" || memberUserIds.has(person.id),
  );

  return NextResponse.json({
    data: projectRows.map(({ project, ownerName, overdue }) => {
      const value = metrics.get(project.id) ?? {
        total: 0,
        done: 0,
        estimate: 0,
        actual: 0,
      };
      const members = memberRows.filter((member) => member.projectId === project.id);
      const memberRole = currentMembershipMap.get(project.id) ?? null;
      return {
        ...serializeProject(project),
        ownerName,
        overdue,
        members: members.map(({ userId, name, role, status }) => ({
          id: userId,
          name,
          role,
          status,
        })),
        memberIds: members.map((member) => member.userId),
        memberCount: members.length,
        testerCount: members.filter((member) => member.role === "tester").length,
        attachmentCount: attachmentCountMap.get(project.id) ?? 0,
        canManage: canManageProject(currentUser, {
          projectId: project.id,
          ownerId: project.ownerId,
          archived: project.archived,
          memberRole,
        }),
        canRestore: canRestoreProject(currentUser, {
          projectId: project.id,
          ownerId: project.ownerId,
          archived: project.archived,
          memberRole,
        }),
        canDeletePermanently: canPermanentlyDeleteProject(currentUser, {
          projectId: project.id,
          ownerId: project.ownerId,
          archived: project.archived,
          memberRole,
        }),
        taskCount: value.total,
        completedTaskCount: value.done,
        progress: value.total ? Math.round((value.done / value.total) * 100) : 0,
        estimateHours: Math.round(value.estimate * 10) / 10,
        actualHours: Math.round(value.actual * 10) / 10,
      };
    }),
    owners: canCreate || canManageAny
      ? selectablePeople.filter(
          (person) => person.status === "active" && canOwnProject(person.role),
        )
      : [],
    people: canCreate || canManageAny ? selectablePeople : [],
    canCreate,
  });
}

/**
 * 创建项目并在同一事务中建立负责人和成员关系。
 *
 * @param request 当前创建项目请求。
 * @return 创建后的项目记录。
 */
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canCreateProjects(currentUser)) return apiError("无权创建项目。", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const name = textValue(body.name, 80);
  const code = projectCode(body.code);
  const description = textValue(body.description, 10_000);
  const draftToken = attachmentDraftToken(body.attachmentDraftToken);
  const color = /^#[0-9a-f]{6}$/i.test(String(body.color))
    ? String(body.color)
    : "#2f7df6";
  const status = isProjectStatus(body.status) ? body.status : "planning";
  const ownerId =
    typeof body.ownerId === "string" && body.ownerId ? body.ownerId : currentUser.id;
  const memberIds = parseMemberIds(body.memberIds, ownerId);
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
  const activeMembers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(inArray(users.id, memberIds), eq(users.status, "active")));
  if (activeMembers.length !== memberIds.length) {
    return apiError("项目成员中包含不存在或已停用的账号。");
  }
  const owner = activeMembers.find((member) => member.id === ownerId);
  if (!owner || !canOwnProject(owner.role)) {
    return apiError("项目负责人必须是正常状态的管理员或研发成员。");
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [project] = await tx
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
      await tx.insert(projectMembers).values(
        activeMembers.map((member) => ({
          projectId: project.id,
          userId: member.id,
          role: projectMemberRoleForUser(member.role, member.id === ownerId),
        })),
      );
      if (draftToken) {
        await tx
          .update(attachments)
          .set({ projectId: project.id, draftToken: null })
          .where(
            and(
              eq(attachments.draftToken, draftToken),
              eq(attachments.uploadedBy, currentUser.id),
            ),
          );
      }
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "project.create",
        entityType: "project",
        entityId: project.id,
        metadata: { name: project.name, code: project.code, memberIds },
      });
      return project;
    });

    return NextResponse.json({ data: serializeProject(created) }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return apiError("项目代号已存在。", 409);
    throw error;
  }
}
