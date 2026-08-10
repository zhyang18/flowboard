import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  auditLogs,
  projectMembers,
  projects,
  sessions,
  tasks,
  users,
  workLogs,
} from "@/db/schema";
import { canManageUsers } from "@/lib/authorization";
import { apiError, isUniqueViolation } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { countWeekdays, startOfUtcDay } from "@/lib/reporting";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";
import { parseUserInput, serializeUser } from "@/lib/users";

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
      status: users.status,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return apiError("用户不存在。", 404);

  const today = startOfUtcDay(new Date());
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 6);
  const [projectCountResult, hourResult, settings] = await Promise.all([
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
      .where(and(eq(workLogs.userId, id), gte(workLogs.workDate, from))),
    getWorkspaceSettings(),
  ]);
  const availableHours = Math.max(
    1,
    countWeekdays(from, today) * (settings ?? defaultWorkspaceSettings).workdayHours,
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
  if (
    currentUser.role !== "super_admin" &&
    (["super_admin", "project_admin"].includes(existing.role) ||
      (typeof body.role === "string" && ["super_admin", "project_admin"].includes(body.role)))
  ) {
    return apiError("只有超级管理员可以维护管理员账号。", 403);
  }
  if (
    id === currentUser.id &&
    (("status" in body && body.status !== currentUser.status) ||
      ("role" in body && body.role !== currentUser.role))
  ) {
    return apiError("不能修改当前登录账号的角色或状态。");
  }
  const removesActiveSuperAdmin =
    existing.role === "super_admin" &&
    existing.status === "active" &&
    (("role" in body && body.role !== "super_admin") ||
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

  const parsed = parseUserInput(body, true);
  if (parsed.error || !parsed.data) return apiError(parsed.error ?? "用户数据无效。");
  if (parsed.data.status === "active" && !existing.passwordHash && !parsed.data.password) {
    return apiError("激活该账号前，请先设置登录密码。");
  }
  const { password, ...fields } = parsed.data;
  const passwordHash = password ? await hashPassword(password) : null;
  const willLoseProjectOwnership =
    (fields.status && fields.status !== "active") ||
    fields.role === "viewer" ||
    fields.role === "tester";
  const willLoseDeveloperAssignments =
    (fields.status && fields.status !== "active") ||
    fields.role === "viewer" ||
    fields.role === "tester";
  const willLoseTesterAssignments =
    (fields.status && fields.status !== "active") ||
    (Boolean(fields.role) && fields.role !== "tester");
  if (willLoseProjectOwnership) {
    const [ownedActiveProjects] = await db
      .select({ value: count() })
      .from(projects)
      .where(and(eq(projects.ownerId, id), eq(projects.archived, false)));
    if (Number(ownedActiveProjects?.value ?? 0) > 0) {
      return apiError("该用户仍是未归档项目负责人，请先转移项目负责人。", 409);
    }
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [user] = await tx
        .update(users)
        .set({
          ...fields,
          ...(passwordHash ? { passwordHash } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();
      if (willLoseDeveloperAssignments) {
        await tx
          .update(tasks)
          .set({ assigneeId: null, updatedAt: new Date() })
          .where(and(eq(tasks.assigneeId, id), ne(tasks.status, "done")));
      }
      if (willLoseTesterAssignments) {
        await tx
          .update(tasks)
          .set({ testerId: null, updatedAt: new Date() })
          .where(and(eq(tasks.testerId, id), ne(tasks.status, "done")));
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
    const today = startOfUtcDay(new Date());
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 6);
    const [projectCountResult, hourResult, settings] = await Promise.all([
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
        .where(and(eq(workLogs.userId, id), gte(workLogs.workDate, from))),
      getWorkspaceSettings(),
    ]);
    const availableHours = Math.max(
      1,
      countWeekdays(from, today) * (settings ?? defaultWorkspaceSettings).workdayHours,
    );
    return NextResponse.json({
      data: serializeUser({
        ...updated,
        projectCount: Number(projectCountResult[0]?.value ?? 0),
        capacity: Math.round((Number(hourResult[0]?.hours ?? 0) / availableHours) * 100),
      }),
    });
  } catch (error) {
    if (isUniqueViolation(error)) return apiError("该邮箱已被使用。", 409);
    throw error;
  }
}

/**
 * 删除没有项目所有权、任务创建记录或工时历史的停用账号。
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
  if (existing.status === "active") return apiError("请先停用账号，再执行删除。");
  const [ownedProjects, reportedTasks, assignedTasks, loggedHours] = await Promise.all([
    db.select({ value: count() }).from(projects).where(eq(projects.ownerId, id)),
    db.select({ value: count() }).from(tasks).where(eq(tasks.reporterId, id)),
    db
      .select({ value: count() })
      .from(tasks)
      .where(or(eq(tasks.assigneeId, id), eq(tasks.testerId, id))),
    db.select({ value: count() }).from(workLogs).where(eq(workLogs.userId, id)),
  ]);
  if (
    Number(ownedProjects[0]?.value ?? 0) > 0 ||
    Number(reportedTasks[0]?.value ?? 0) > 0 ||
    Number(assignedTasks[0]?.value ?? 0) > 0 ||
    Number(loggedHours[0]?.value ?? 0) > 0
  ) {
    return apiError(
      "该账号仍关联项目、任务责任或历史工时，只能保持停用，不能删除。",
      409,
    );
  }

  await db.transaction(async (tx) => {
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "user.delete",
      entityType: "user",
      entityId: id,
      metadata: { email: existing.email, name: existing.name },
    });
    await tx.delete(users).where(eq(users.id, id));
  });
  return NextResponse.json({ success: true });
}
