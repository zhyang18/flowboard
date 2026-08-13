import { and, eq, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { getDb } from "@/db";
import {
  projectMembers,
  projects,
  type RolePermissions,
  type ProjectMemberRole,
  type TaskStatus,
  type UserRole,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/session";

export type ProjectAccess = {
  projectId: string;
  ownerId: string;
  archived: boolean;
  memberRole: ProjectMemberRole | null;
};

type RoleCapabilityUser = {
  role: UserRole;
  permissions?: RolePermissions;
};

/**
 * 判断角色是否具备任务协作权限。
 *
 * @param user 用户的基础角色和可选权限定义。
 * @return 超级管理员或启用任务管理权限时返回 true。
 */
export function hasTaskManagementPermission(user: RoleCapabilityUser): boolean {
  if (user.role === "super_admin") return true;
  if (user.permissions) return user.permissions.manageTasks;
  return user.role !== "viewer";
}

/**
 * 判断用户是否可以成为任务开发负责人。
 *
 * @param user 用户的基础角色和权限定义。
 * @return 具备任务权限且不是测试或只读角色时返回 true。
 */
export function canBeTaskDeveloper(user: RoleCapabilityUser): boolean {
  return (
    hasTaskManagementPermission(user) &&
    user.role !== "tester" &&
    user.role !== "viewer"
  );
}

/**
 * 判断用户是否可以成为任务测试负责人。
 *
 * @param user 用户的基础角色和权限定义。
 * @return 具备任务权限且基础角色为测试人员时返回 true。
 */
export function canBeTaskTester(user: RoleCapabilityUser): boolean {
  return hasTaskManagementPermission(user) && user.role === "tester";
}

/**
 * 判断当前用户是否可以创建附件草稿。
 *
 * @param user 当前登录用户。
 * @return 具备项目或任务写入权限时返回 true。
 */
export function canUploadAttachmentDraft(user: RoleCapabilityUser): boolean {
  if (user.role === "super_admin") return true;
  if (user.permissions) {
    return user.permissions.manageProjects || user.permissions.manageTasks;
  }
  return user.role !== "viewer";
}

/**
 * 判断用户是否具备组织级用户管理权限。
 *
 * @param user 当前登录用户。
 * @return 具备用户管理权限时返回 true。
 */
export function canManageUsers(user: Pick<CurrentUser, "role">): boolean {
  return (
    user.role === "super_admin" ||
    ("permissions" in user
      ? Boolean((user as CurrentUser).permissions.manageUsers)
      : user.role === "project_admin")
  );
}

/**
 * 判断用户是否可以创建项目。
 *
 * @param user 当前登录用户。
 * @return 可以创建项目时返回 true。
 */
export function canCreateProjects(user: Pick<CurrentUser, "role">): boolean {
  return (
    user.role === "super_admin" ||
    ("permissions" in user
      ? Boolean((user as CurrentUser).permissions.manageProjects)
      : user.role === "project_admin")
  );
}

/**
 * 判断用户是否具备报表文件导出权限。
 *
 * @param user 当前登录用户。
 * @return 超级管理员或项目管理员返回 true。
 */
export function canExportReports(user: Pick<CurrentUser, "role">): boolean {
  return (
    user.role === "super_admin" ||
    ("permissions" in user
      ? Boolean((user as CurrentUser).permissions.exportReports)
      : user.role === "project_admin")
  );
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
 * 判断用户是否可以在指定项目中维护任务、指派负责人和调整任务迭代。
 *
 * @param user 当前登录用户。
 * @param access 项目访问关系。
 * @return 同时具备任务权限和项目管理关系时返回 true。
 */
export function canManageTasksInProject(
  user: Pick<CurrentUser, "id" | "role">,
  access: ProjectAccess | null,
): boolean {
  if (!hasTaskManagementPermission(user as RoleCapabilityUser)) return false;
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
 * 判断用户是否可以审核指定项目的工时记录。
 *
 * @param user 当前登录用户。
 * @param access 项目访问关系。
 * @return 具备工时审批权限且是项目管理者时返回 true。
 */
export function canApproveWorkLogs(
  user: Pick<CurrentUser, "id" | "role">,
  access: ProjectAccess | null,
): boolean {
  if (
    user.role !== "super_admin" &&
    "permissions" in user &&
    !(user as CurrentUser).permissions.approveWorkLogs
  ) {
    return false;
  }
  if (!access || access.archived || user.role === "viewer" || user.role === "tester") {
    return false;
  }
  return (
    user.role === "super_admin" ||
    access.ownerId === user.id ||
    access.memberRole === "manager"
  );
}

/**
 * 判断用户是否可以恢复已归档项目。
 *
 * @param user 当前登录用户。
 * @param access 项目访问关系。
 * @return 超级管理员、项目负责人或项目 manager 可恢复时返回 true。
 */
export function canRestoreProject(
  user: Pick<CurrentUser, "id" | "role">,
  access: ProjectAccess | null,
): boolean {
  if (
    !access ||
    !access.archived ||
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
 * 判断用户是否可以永久删除已归档项目。
 *
 * @param user 当前登录用户。
 * @param access 项目访问关系。
 * @return 超级管理员操作已归档项目时返回 true。
 */
export function canPermanentlyDeleteProject(
  user: Pick<CurrentUser, "role">,
  access: ProjectAccess | null,
): boolean {
  return Boolean(access?.archived && user.role === "super_admin");
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
  if (!hasTaskManagementPermission(user as RoleCapabilityUser)) return false;
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
  if (!hasTaskManagementPermission(user as RoleCapabilityUser)) return false;
  if (canManageTasksInProject(user, access)) return true;
  if (!canContributeToProject(user, access)) return false;
  if (user.role === "tester") return false;
  return task.assigneeId === user.id || task.reporterId === user.id;
}

/**
 * 判断当前用户是否是任务当前阶段唯一允许流转状态的指派人员。
 *
 * @param user 当前登录用户。
 * @param access 任务所属项目的访问关系。
 * @param task 任务当前状态以及开发、测试负责人关系。
 * @return 开发阶段由开发负责人返回 true；待评审阶段由指定测试负责人返回 true。
 */
export function canChangeTaskStatus(
  user: Pick<CurrentUser, "id" | "role">,
  access: ProjectAccess | null,
  task: {
    status: TaskStatus;
    assigneeId: string | null;
    testerId: string | null;
  },
): boolean {
  if (!canContributeToProject(user, access)) return false;
  if (task.status === "review" && task.testerId) {
    return user.role === "tester" && task.testerId === user.id;
  }
  return user.role !== "tester" && task.assigneeId === user.id;
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
    canManageTasksInProject(user, access) ||
    assigneeId === user.id
  );
}

/**
 * 判断当前用户在创建任务时能否选择指定测试负责人。
 *
 * @param user 当前登录用户。
 * @param access 任务所属项目的访问关系。
 * @param testerId 待指派的测试负责人 ID，null 表示暂不指派。
 * @return 项目研发成员可指派项目测试人员；测试人员只能指派自己。
 */
export function canAssignTaskTester(
  user: Pick<CurrentUser, "id" | "role">,
  access: ProjectAccess | null,
  testerId: string | null,
): boolean {
  if (testerId === null) return true;
  if (!canContributeToProject(user, access)) return false;
  return user.role !== "tester" || testerId === user.id;
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
  if (!canContributeToProject(user, access)) return false;
  if (task.testerId) {
    return user.role === "tester" && task.testerId === user.id;
  }
  return user.role !== "tester" && task.assigneeId === user.id;
}
