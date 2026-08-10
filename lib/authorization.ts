import { and, eq, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { getDb } from "@/db";
import {
  projectMembers,
  projects,
  type ProjectMemberRole,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/session";

export type ProjectAccess = {
  projectId: string;
  ownerId: string;
  archived: boolean;
  memberRole: ProjectMemberRole | null;
};

/**
 * 判断用户是否具备组织级用户管理权限。
 *
 * @param user 当前登录用户。
 * @return 具备用户管理权限时返回 true。
 */
export function canManageUsers(user: Pick<CurrentUser, "role">): boolean {
  return user.role === "super_admin" || user.role === "project_admin";
}

/**
 * 判断用户是否可以创建项目。
 *
 * @param user 当前登录用户。
 * @return 可以创建项目时返回 true。
 */
export function canCreateProjects(user: Pick<CurrentUser, "role">): boolean {
  return user.role === "super_admin" || user.role === "project_admin";
}

/**
 * 判断用户是否具备报表文件导出权限。
 *
 * @param user 当前登录用户。
 * @return 超级管理员或项目管理员返回 true。
 */
export function canExportReports(user: Pick<CurrentUser, "role">): boolean {
  return user.role === "super_admin" || user.role === "project_admin";
}

/**
 * 生成当前用户可见项目的数据库过滤条件。
 *
 * @param user 当前登录用户。
 * @param projectIdColumn 查询中代表项目 ID 的列。
 * @return 可直接用于 Drizzle where 的过滤条件。
 */
export function projectVisibilityCondition(
  user: Pick<CurrentUser, "id" | "role">,
  projectIdColumn: SQLWrapper,
): SQL {
  if (user.role === "super_admin") return sql`true`;

  return sql`exists (
    select 1
    from ${projectMembers}
    where ${projectMembers.projectId} = ${projectIdColumn}
      and ${projectMembers.userId} = ${user.id}
  )`;
}

/**
 * 查询当前用户对指定项目的访问关系。
 *
 * @param user 当前登录用户。
 * @param projectId 项目 ID。
 * @return 项目存在且用户可访问时返回访问关系，否则返回 null。
 */
export async function getProjectAccess(
  user: Pick<CurrentUser, "id" | "role">,
  projectId: string,
): Promise<ProjectAccess | null> {
  const [record] = await getDb()
    .select({
      projectId: projects.id,
      ownerId: projects.ownerId,
      archived: projects.archived,
      memberRole: projectMembers.role,
    })
    .from(projects)
    .leftJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, projects.id),
        eq(projectMembers.userId, user.id),
      ),
    )
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!record) return null;
  if (user.role !== "super_admin" && !record.memberRole) return null;
  return record;
}

/**
 * 判断用户是否可以维护指定项目。
 *
 * @param user 当前登录用户。
 * @param access 项目访问关系。
 * @return 可以维护项目时返回 true。
 */
export function canManageProject(
  user: Pick<CurrentUser, "id" | "role">,
  access: ProjectAccess | null,
): boolean {
  if (
    !access ||
    access.archived ||
    user.role === "viewer" ||
    user.role === "tester"
  ) {
    return false;
  }
  return (
    user.role === "super_admin" ||
    access.ownerId === user.id ||
    access.memberRole === "manager"
  );
}

/**
 * 判断用户是否可以在指定项目中贡献任务或工时。
 *
 * @param user 当前登录用户。
 * @param access 项目访问关系。
 * @return 可以写入项目业务数据时返回 true。
 */
export function canContributeToProject(
  user: Pick<CurrentUser, "role">,
  access: ProjectAccess | null,
): boolean {
  return Boolean(
    access &&
      !access.archived &&
      user.role !== "viewer" &&
      access.memberRole !== "viewer",
  );
}

/**
 * 判断用户是否可以编辑任务。
 *
 * @param user 当前登录用户。
 * @param access 任务所属项目的访问关系。
 * @param task 任务的开发负责人、测试负责人和创建人信息。
 * @return 可以编辑任务时返回 true。
 */
export function canEditTask(
  user: Pick<CurrentUser, "id" | "role">,
  access: ProjectAccess | null,
  task: { assigneeId: string | null; testerId: string | null; reporterId: string },
): boolean {
  if (canManageProject(user, access)) return true;
  if (!canContributeToProject(user, access)) return false;
  if (user.role === "tester") return task.testerId === user.id;
  return (
    task.assigneeId === user.id || task.reporterId === user.id
  );
}

/**
 * 判断当前用户在创建任务时能否选择指定开发负责人。
 *
 * @param user 当前登录用户。
 * @param access 任务所属项目的访问关系。
 * @param assigneeId 待指派的开发负责人 ID，null 表示暂不指派。
 * @return 项目管理者可任意指派，普通成员只能不指派或指派自己。
 */
export function canAssignTaskAssignee(
  user: Pick<CurrentUser, "id" | "role">,
  access: ProjectAccess | null,
  assigneeId: string | null,
): boolean {
  return (
    assigneeId === null ||
    canManageProject(user, access) ||
    assigneeId === user.id
  );
}

/**
 * 判断当前用户能否验收带测试负责人的任务并将其置为完成。
 *
 * @param user 当前登录用户。
 * @param access 任务所属项目的访问关系。
 * @param task 任务的开发、测试和创建人关系。
 * @return 项目管理者或当前指派的测试负责人可完成验收。
 */
export function canApproveTaskCompletion(
  user: Pick<CurrentUser, "id" | "role">,
  access: ProjectAccess | null,
  task: { assigneeId: string | null; testerId: string | null; reporterId: string },
): boolean {
  if (!task.testerId) return canEditTask(user, access, task);
  return (
    canManageProject(user, access) ||
    (user.role === "tester" && task.testerId === user.id)
  );
}
