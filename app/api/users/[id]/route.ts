import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  attachments,
  auditLogs,
  projectMembers,
  projects,
  roleDefinitions,
  sessions,
  SYSTEM_ROLE_DEFINITION_IDS,
  sprints,
  taskRejections,
  tasks,
  users,
  workLogs,
} from "@/db/schema";
import {
  canBeTaskDeveloper,
  canBeTaskTester,
  canManageUsers,
} from "@/lib/authorization";
import { apiError, isUniqueViolation, uuidValue } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { countWeekdays, rollingDateRange } from "@/lib/reporting";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";
import { projectLifecycleLockQueries } from "@/lib/sprints";
import {
  canOwnProject,
  isUserRole,
  parseUserInput,
  serializeUser,
} from "@/lib/users";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 读取单个用户及其真实项目数和最近七日容量。
 *
 * @param _request 当前查询请求。
 * @param context 包含用户 ID 的路由上下文。
 * @return 用户详情。
 */
export async function GET(_request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权查看用户资料。", 403);
  const { id } = await context.params;
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      department: users.department,
      team: users.team,
      role: users.role,
      roleDefinitionId: users.roleDefinitionId,
      roleName: roleDefinitions.name,
      status: users.status,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .innerJoin(roleDefinitions, eq(users.roleDefinitionId, roleDefinitions.id))
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return apiError("用户不存在。", 404);

  const settings = (await getWorkspaceSettings()) ?? defaultWorkspaceSettings;
  const { from, to } = rollingDateRange(new Date(), settings.timezone, 7);
  const [projectCountResult, hourResult] = await Promise.all([
    db
      .select({ value: countDistinct(projectMembers.projectId) })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(
        and(
          eq(projectMembers.userId, id),
          eq(projects.archived, false),
        ),
      ),
    db
      .select({ hours: sql<number>`coalesce(sum(${workLogs.durationHours}), 0)` })
      .from(workLogs)
      .where(
        and(
          eq(workLogs.userId, id),
          gte(workLogs.workDate, from),
          lte(workLogs.workDate, to),
        ),
      ),
  ]);
  const availableHours = Math.max(
    1,
    countWeekdays(from, to) * settings.workdayHours,
  );
  return NextResponse.json({
    data: serializeUser({
      ...user,
      projectCount: Number(projectCountResult[0]?.value ?? 0),
      capacity: Math.round((Number(hourResult[0]?.hours ?? 0) / availableHours) * 100),
    }),
  });
}

/**
 * 更新用户资料、角色、状态或密码。
 *
 * @param request 当前更新请求。
 * @param context 包含用户 ID 的路由上下文。
 * @return 更新后的用户数据。
 */
export async function PATCH(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权编辑用户。", 403);
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return apiError("用户不存在。", 404);
  const [currentRoleDefinition] = await db
    .select()
    .from(roleDefinitions)
    .where(eq(roleDefinitions.id, existing.roleDefinitionId))
    .limit(1);
  if (!currentRoleDefinition) return apiError("用户关联的角色不存在。", 409);

  const roleChangeRequested = "roleDefinitionId" in body || "role" in body;
  const requestedRoleDefinitionId = roleChangeRequested
    ? uuidValue(body.roleDefinitionId) ??
      (isUserRole(body.role) ? SYSTEM_ROLE_DEFINITION_IDS[body.role] : null)
    : existing.roleDefinitionId;
  if (!requestedRoleDefinitionId) return apiError("请选择有效的用户角色。");
  const [selectedRole] = await db
    .select()
    .from(roleDefinitions)
    .where(eq(roleDefinitions.id, requestedRoleDefinitionId))
    .limit(1);
  if (!selectedRole) return apiError("所选角色不存在。", 404);
  if (
    currentUser.role !== "super_admin" &&
    (["super_admin", "project_admin"].includes(existing.role) ||
      ["super_admin", "project_admin"].includes(selectedRole.baseRole))
  ) {
    return apiError("只有超级管理员可以维护管理员账号。", 403);
  }
  if (
    id === currentUser.id &&
      (("status" in body && body.status !== currentUser.status) ||
      (roleChangeRequested && selectedRole.id !== existing.roleDefinitionId))
  ) {
    return apiError("不能修改当前登录账号的角色或状态。");
  }
  const removesActiveSuperAdmin =
    existing.role === "super_admin" &&
    existing.status === "active" &&
    ((roleChangeRequested && selectedRole.baseRole !== "super_admin") ||
      ("status" in body && body.status !== "active"));
  if (removesActiveSuperAdmin) {
    const [activeSuperAdmins] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.role, "super_admin"), eq(users.status, "active")));
    if (Number(activeSuperAdmins?.value ?? 0) <= 1) {
      return apiError("系统必须至少保留一名正常状态的超级管理员。", 409);
    }
  }

  const parsed = parseUserInput(
    roleChangeRequested ? { ...body, role: selectedRole.baseRole } : body,
    true,
  );
  if (parsed.error || !parsed.data) return apiError(parsed.error ?? "用户数据无效。");
  if (parsed.data.status === "active" && !existing.passwordHash && !parsed.data.password) {
    return apiError("激活该账号前，请先设置登录密码。");
  }
  const { password, ...fields } = parsed.data;
  const passwordHash = password ? await hashPassword(password) : null;
  const accessPolicyChanged = roleChangeRequested || "status" in fields;
  const nextStatus = fields.status ?? existing.status;
  const nextRole = roleChangeRequested ? selectedRole.baseRole : existing.role;
  const nextRoleCapability = {
    role: nextRole,
    permissions: selectedRole.permissions,
  };
  const willLoseProjectOwnership =
    accessPolicyChanged &&
    (nextStatus !== "active" || !canOwnProject(nextRole));
  const willLoseDeveloperAssignments =
    accessPolicyChanged &&
    (nextStatus !== "active" || !canBeTaskDeveloper(nextRoleCapability));
  const willLoseTesterAssignments =
    accessPolicyChanged &&
    (nextStatus !== "active" || !canBeTaskTester(nextRoleCapability));
  if (willLoseProjectOwnership) {
    const [ownedActiveProjects] = await db
      .select({ value: count() })
      .from(projects)
      .where(eq(projects.ownerId, id));
    if (Number(ownedActiveProjects?.value ?? 0) > 0) {
      return apiError("该用户仍是项目负责人，请先转移全部项目的负责人。", 409);
    }
  }
  const assignmentProjectRows =
    willLoseDeveloperAssignments || willLoseTesterAssignments
      ? await db
          .selectDistinct({ projectId: tasks.projectId })
          .from(tasks)
          .where(
            or(
              willLoseDeveloperAssignments ? eq(tasks.assigneeId, id) : undefined,
              willLoseTesterAssignments ? eq(tasks.testerId, id) : undefined,
            ),
          )
      : [];

  try {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`user-lifecycle:${id}`}))`,
      );
      if (removesActiveSuperAdmin) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('flowboard:active-super-admin'))`,
        );
        const [activeSuperAdmins] = await tx
          .select({ value: count() })
          .from(users)
          .where(
            and(
              eq(users.role, "super_admin"),
              eq(users.status, "active"),
            ),
          );
        if (Number(activeSuperAdmins?.value ?? 0) <= 1) {
          throw new Error("LAST_ACTIVE_SUPER_ADMIN");
        }
      }
      for (const lockQuery of projectLifecycleLockQueries(
        assignmentProjectRows.map((project) => project.projectId),
      )) {
        await tx.execute(lockQuery);
      }
      const [user] = await tx
        .update(users)
        .set({
          ...fields,
          ...(roleChangeRequested ? { roleDefinitionId: selectedRole.id } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(users.id, id),
            eq(users.updatedAt, existing.updatedAt),
          ),
        )
        .returning();
      if (!user) throw new Error("USER_CHANGED");
      if (willLoseDeveloperAssignments) {
        await tx
          .update(tasks)
          .set({ assigneeId: null, updatedAt: new Date() })
          .where(
            and(
              eq(tasks.assigneeId, id),
              notExists(
                tx
                  .select({ id: sprints.id })
                  .from(sprints)
                  .where(and(eq(sprints.id, tasks.sprintId), eq(sprints.status, "completed"))),
              ),
            ),
          );
      }
      if (willLoseTesterAssignments) {
        await tx
          .update(tasks)
          .set({ testerId: null, updatedAt: new Date() })
          .where(
            and(
              eq(tasks.testerId, id),
              notExists(
                tx
                  .select({ id: sprints.id })
                  .from(sprints)
                  .where(and(eq(sprints.id, tasks.sprintId), eq(sprints.status, "completed"))),
              ),
            ),
          );
      }
      if (passwordHash || (fields.status && fields.status !== "active")) {
        await tx.delete(sessions).where(eq(sessions.userId, id));
      }
      if (fields.role === "viewer") {
        await tx
          .update(projectMembers)
          .set({ role: "viewer", updatedAt: new Date() })
          .where(eq(projectMembers.userId, id));
      } else if (fields.role === "tester") {
        await tx
          .update(projectMembers)
          .set({ role: "tester", updatedAt: new Date() })
          .where(eq(projectMembers.userId, id));
      } else if (fields.role) {
        await tx
          .update(projectMembers)
          .set({ role: "member", updatedAt: new Date() })
          .where(
            and(
              eq(projectMembers.userId, id),
              inArray(projectMembers.role, ["viewer", "tester"]),
            ),
          );
      }
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "user.update",
        entityType: "user",
        entityId: id,
        metadata: { changedFields: Object.keys(body).filter((key) => key !== "password") },
      });
      return user;
    });
    const settings = (await getWorkspaceSettings()) ?? defaultWorkspaceSettings;
    const { from, to } = rollingDateRange(new Date(), settings.timezone, 7);
    const [projectCountResult, hourResult] = await Promise.all([
      db
        .select({ value: countDistinct(projectMembers.projectId) })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(
          and(
            eq(projectMembers.userId, id),
            eq(projects.archived, false),
          ),
        ),
      db
        .select({ hours: sql<number>`coalesce(sum(${workLogs.durationHours}), 0)` })
        .from(workLogs)
        .where(
          and(
            eq(workLogs.userId, id),
            gte(workLogs.workDate, from),
            lte(workLogs.workDate, to),
          ),
        ),
    ]);
    const availableHours = Math.max(
      1,
      countWeekdays(from, to) * settings.workdayHours,
    );
    return NextResponse.json({
      data: serializeUser({
        ...updated,
        roleName: selectedRole.name,
        projectCount: Number(projectCountResult[0]?.value ?? 0),
        capacity: Math.round((Number(hourResult[0]?.hours ?? 0) / availableHours) * 100),
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ACTIVE_SUPER_ADMIN") {
      return apiError("系统必须至少保留一名正常状态的超级管理员。", 409);
    }
    if (error instanceof Error && error.message === "USER_CHANGED") {
      return apiError("用户资料已被其他操作更新，请刷新后重试。", 409);
    }
    if (isUniqueViolation(error)) return apiError("该邮箱已被使用。", 409);
    throw error;
  }
}

/**
 * 删除没有项目、任务、工时、审批或附件历史的停用账号。
 *
 * @param request 当前删除请求。
 * @param context 包含用户 ID 的路由上下文。
 * @return 删除成功标记。
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (currentUser.role !== "super_admin") {
    return apiError("只有超级管理员可以删除账号。", 403);
  }
  const { id } = await context.params;
  if (id === currentUser.id) return apiError("不能删除当前登录账号。");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return apiError("用户不存在。", 404);
  if (existing.status !== "disabled") return apiError("请先停用账号，再执行删除。");
  const [
    ownedProjects,
    reportedTasks,
    assignedTasks,
    loggedHours,
    testRecords,
    uploadedAttachments,
    approvedWorkLogs,
  ] = await Promise.all([
    db.select({ value: count() }).from(projects).where(eq(projects.ownerId, id)),
    db.select({ value: count() }).from(tasks).where(eq(tasks.reporterId, id)),
    db
      .select({ value: count() })
      .from(tasks)
      .where(or(eq(tasks.assigneeId, id), eq(tasks.testerId, id))),
    db.select({ value: count() }).from(workLogs).where(eq(workLogs.userId, id)),
    db
      .select({ value: count() })
      .from(taskRejections)
      .where(eq(taskRejections.testerId, id)),
    db
      .select({ value: count() })
      .from(attachments)
      .where(
        and(
          eq(attachments.uploadedBy, id),
          isNull(attachments.draftToken),
        ),
      ),
    db
      .select({ value: count() })
      .from(workLogs)
      .where(eq(workLogs.approvedBy, id)),
  ]);
  if (
    Number(ownedProjects[0]?.value ?? 0) > 0 ||
    Number(reportedTasks[0]?.value ?? 0) > 0 ||
    Number(assignedTasks[0]?.value ?? 0) > 0 ||
    Number(loggedHours[0]?.value ?? 0) > 0 ||
    Number(testRecords[0]?.value ?? 0) > 0 ||
    Number(uploadedAttachments[0]?.value ?? 0) > 0 ||
    Number(approvedWorkLogs[0]?.value ?? 0) > 0
  ) {
    return apiError(
      "该账号仍关联项目、任务、测试、附件、审核或历史工时，只能保持停用，不能删除。",
      409,
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`user-lifecycle:${id}`}))`,
      );
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "user.delete",
        entityType: "user",
        entityId: id,
        metadata: { email: existing.email, name: existing.name },
      });
      await tx
        .delete(attachments)
        .where(
          and(
            eq(attachments.uploadedBy, id),
            isNotNull(attachments.draftToken),
          ),
        );
      const [deleted] = await tx
        .delete(users)
        .where(
          and(
            eq(users.id, id),
            eq(users.status, "disabled"),
            eq(users.updatedAt, existing.updatedAt),
          ),
        )
        .returning({ id: users.id });
      if (!deleted) throw new Error("USER_CHANGED");
    });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_CHANGED") {
      return apiError("用户资料已变化，请刷新后重试。", 409);
    }
    throw error;
  }
  return NextResponse.json({ success: true });
}
