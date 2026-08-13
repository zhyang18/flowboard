import type { ProjectMemberRole, UserRole, UserStatus } from "@/db/schema";
import { normalizeEmail, textValue } from "./api";

export const USER_ROLES: UserRole[] = [
  "super_admin",
  "project_admin",
  "member",
  "tester",
  "viewer",
];

export const USER_STATUSES: UserStatus[] = [
  "active",
  "disabled",
  "invited",
];

export const roleLabels: Record<UserRole, string> = {
  super_admin: "超级管理员",
  project_admin: "项目管理员",
  member: "研发成员",
  tester: "测试人员",
  viewer: "只读访客",
};

export const statusLabels: Record<UserStatus, string> = {
  active: "正常",
  disabled: "已停用",
  invited: "待激活",
};

/**
 * 判断输入是否为合法用户角色。
 *
 * @param value 待判断值。
 * @return 属于用户角色枚举时返回 true。
 */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

/**
 * 判断输入是否为合法账号状态。
 *
 * @param value 待判断值。
 * @return 属于账号状态枚举时返回 true。
 */
export function isUserStatus(value: unknown): value is UserStatus {
  return (
    typeof value === "string" &&
    USER_STATUSES.includes(value as UserStatus)
  );
}

/**
 * 判断用户角色是否允许担任项目负责人。
 *
 * @param role 待判断的用户角色。
 * @return 可以担任项目负责人时返回 true。
 */
export function canOwnProject(role: UserRole): boolean {
  return role !== "viewer" && role !== "tester";
}

/**
 * 根据全局角色和负责人关系计算项目成员角色。
 *
 * @param role 用户的全局角色。
 * @param isOwner 用户是否为项目负责人。
 * @return 对应的项目成员角色。
 */
export function projectMemberRoleForUser(
  role: UserRole,
  isOwner: boolean,
): ProjectMemberRole {
  if (isOwner) return "manager";
  if (role === "viewer") return "viewer";
  if (role === "tester") return "tester";
  return "member";
}

export type UserInput = {
  name: string;
  email: string;
  phone: string | null;
  department: string;
  team: string;
  role: UserRole;
  status: UserStatus;
  password: string;
};

/**
 * 校验并规范化用户新增或更新输入。
 *
 * @param input 客户端提交的用户字段。
 * @param partial 是否允许只提交部分字段。
 * @return 规范化后的用户数据或校验错误。
 */
export function parseUserInput(
  input: Record<string, unknown>,
  partial = false,
): { data?: Partial<UserInput>; error?: string } {
  const data: Partial<UserInput> = {};

  if (!partial || "name" in input) {
    const name = textValue(input.name, 60);
    if (!name) return { error: "请输入用户姓名。" };
    data.name = name;
  }

  if (!partial || "email" in input) {
    const email = normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "请输入有效的邮箱地址。" };
    }
    data.email = email;
  }

  if (!partial || "department" in input) {
    const department = textValue(input.department, 60);
    if (!department) return { error: "请输入所属部门。" };
    data.department = department;
  }

  if (!partial || "team" in input) {
    const team = textValue(input.team, 60);
    if (!team) return { error: "请输入所属团队。" };
    data.team = team;
  }

  if (!partial || "role" in input) {
    if (!isUserRole(input.role)) return { error: "用户角色无效。" };
    data.role = input.role;
  }

  if (!partial || "status" in input) {
    if (!isUserStatus(input.status)) return { error: "账号状态无效。" };
    data.status = input.status;
  }

  if (!partial || "phone" in input) {
    data.phone = textValue(input.phone, 30) || null;
  }

  if (!partial || "password" in input) {
    const password = typeof input.password === "string" ? input.password : "";
    if (password && password.length < 10) {
      return { error: "登录密码至少需要 10 个字符。" };
    }
    if (password.length > 128) {
      return { error: "登录密码不能超过 128 个字符。" };
    }
    if (password && (!/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      return { error: "登录密码必须同时包含字母和数字。" };
    }
    data.password = password;
  }

  return { data };
}

/**
 * 将用户数据库记录转换成客户端安全格式。
 *
 * @param user 不包含密码散列的用户记录。
 * @return 日期已经序列化的用户对象。
 */
export function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  department: string;
  team: string;
  role: UserRole;
  status: UserStatus;
  projectCount: number;
  capacity: number;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...user,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
