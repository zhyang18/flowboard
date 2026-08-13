import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  auditLogs,
  projectMembers,
  projects,
  roleDefinitions,
  SYSTEM_ROLE_DEFINITION_IDS,
  tasks,
  users,
  workLogs,
} from "@/db/schema";
import { canManageUsers } from "@/lib/authorization";
import { apiError, isUniqueViolation, uuidValue } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { countWeekdays, rollingDateRange } from "@/lib/reporting";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";
import {
  isUserSortKey,
  isUserRole,
  isUserStatus,
  parseUserInput,
  serializeUser,
  type UserInput,
} from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 获取用户列表，并从真实项目成员和最近工时派生项目数与容量。
 *
 * @param request 当前用户查询请求。
 * @return 用户分页、统计和筛选数据。
 */
export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权查看用户列表。", 403);

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim().slice(0, 80) ?? "";
  const department = searchParams.get("department")?.trim().slice(0, 60) ?? "";
  const status = searchParams.get("status") ?? "";
  const requestedSortBy = searchParams.get("sortBy");
  const sortBy = isUserSortKey(requestedSortBy) ? requestedSortBy : "createdAt";
  const sortDirection = searchParams.get("sortDirection") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(searchParams.get("pageSize")) || 10));
  const conditions: SQL[] = [];
  if (query) {
    const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(
      or(ilike(users.name, pattern), ilike(users.email, pattern), ilike(users.team, pattern))!,
    );
  }
  if (department) conditions.push(eq(users.department, department));
  if (isUserStatus(status)) conditions.push(eq(users.status, status));

  const where = conditions.length ? and(...conditions) : undefined;
  const db = getDb();
  const sortColumns = {
    name: users.name,
    department: users.department,
    role: roleDefinitions.name,
    status: users.status,
    lastSeenAt: users.lastSeenAt,
    createdAt: users.createdAt,
  } as const;
  const sortColumn = sortColumns[sortBy];
  const orderBy = sortDirection === "asc" ? asc(sortColumn) : desc(sortColumn);
  const workspaceSettings = (await getWorkspaceSettings()) ?? defaultWorkspaceSettings;
  const { from, to } = rollingDateRange(new Date(), workspaceSettings.timezone, 7);
  const [records, totalResult, statsResult, departmentRows] = await Promise.all([
    db
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
      .where(where)
      .orderBy(orderBy, asc(users.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(users).where(where),
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
        invited: sql<number>`count(*) filter (where ${users.status} = 'invited')::int`,
        admins: sql<number>`count(*) filter (where ${users.role} in ('super_admin', 'project_admin'))::int`,
      })
      .from(users),
    db.selectDistinct({ department: users.department }).from(users).orderBy(users.department),
  ]);

  const userIds = records.map((record) => record.id);
  const [projectCounts, recentHours] = userIds.length
    ? await Promise.all([
        db
          .select({
            userId: projectMembers.userId,
            value: countDistinct(projectMembers.projectId),
          })
          .from(projectMembers)
          .innerJoin(projects, eq(projectMembers.projectId, projects.id))
          .where(
            and(
              inArray(projectMembers.userId, userIds),
              eq(projects.archived, false),
            ),
          )
          .groupBy(projectMembers.userId),
        db
          .select({
            userId: workLogs.userId,
            hours: sql<number>`coalesce(sum(${workLogs.durationHours}), 0)`,
          })
          .from(workLogs)
          .innerJoin(tasks, eq(workLogs.taskId, tasks.id))
          .where(
              and(
                inArray(workLogs.userId, userIds),
                gte(workLogs.workDate, from),
                lte(workLogs.workDate, to),
              ),
          )
          .groupBy(workLogs.userId),
      ])
    : [[], []];
  const projectCountMap = new Map(projectCounts.map((item) => [item.userId, Number(item.value)]));
  const hourMap = new Map(recentHours.map((item) => [item.userId, Number(item.hours)]));
  const availableHours = Math.max(
    1,
    countWeekdays(from, to) * workspaceSettings.workdayHours,
  );

  return NextResponse.json({
    data: records.map((record) =>
      serializeUser({
        ...record,
        projectCount: projectCountMap.get(record.id) ?? 0,
        capacity: Math.round(((hourMap.get(record.id) ?? 0) / availableHours) * 100),
      }),
    ),
    pagination: { page, pageSize, total: Number(totalResult[0]?.value ?? 0) },
    stats: statsResult[0] ?? { total: 0, active: 0, invited: 0, admins: 0 },
    departments: departmentRows.map((item) => item.department),
  });
}

/**
 * 创建组织用户，角色提升仅允许超级管理员执行。
 *
 * @param request 当前创建用户请求。
 * @return 创建后的安全用户数据。
 */
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权创建用户。", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  const requestedRoleDefinitionId =
    uuidValue(body.roleDefinitionId) ??
    (isUserRole(body.role) ? SYSTEM_ROLE_DEFINITION_IDS[body.role] : null);
  if (!requestedRoleDefinitionId) return apiError("请选择用户角色。");
  const [selectedRole] = await getDb()
    .select()
    .from(roleDefinitions)
    .where(eq(roleDefinitions.id, requestedRoleDefinitionId))
    .limit(1);
  if (!selectedRole) return apiError("所选角色不存在。", 404);

  const parsed = parseUserInput({ ...body, role: selectedRole.baseRole });
  if (!parsed.data || parsed.error) return apiError(parsed.error ?? "用户数据无效。");
  const data = parsed.data as UserInput;
  if (currentUser.role !== "super_admin" && ["super_admin", "project_admin"].includes(data.role)) {
    return apiError("只有超级管理员可以授予管理员角色。", 403);
  }
  if (data.status === "active" && !data.password) {
    return apiError("正常状态的账号需要设置初始密码。");
  }

  const passwordHash = data.password ? await hashPassword(data.password) : null;
  try {
    const created = await getDb().transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: data.name,
          email: data.email,
          phone: data.phone,
          department: data.department,
          team: data.team,
          role: data.role,
          roleDefinitionId: selectedRole.id,
          status: data.status,
          passwordHash,
        })
        .returning();
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "user.create",
        entityType: "user",
        entityId: user.id,
        metadata: { email: user.email, role: user.role, status: user.status },
      });
      return user;
    });
    return NextResponse.json(
      {
        data: serializeUser({
          ...created,
          roleName: selectedRole.name,
          projectCount: 0,
          capacity: 0,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) return apiError("该邮箱已被使用。", 409);
    throw error;
  }
}
