import type { UserRole, UserStatus } from "@/db/schema";
import { normalizeEmail, textValue } from "./api";

export const USER_ROLES: UserRole[] = [
  "super_admin",
  "project_admin",
  "member",
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
  viewer: "只读访客",
};

export const statusLabels: Record<UserStatus, string> = {
  active: "正常",
  disabled: "已停用",
  invited: "待激活",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function isUserStatus(value: unknown): value is UserStatus {
  return (
    typeof value === "string" &&
    USER_STATUSES.includes(value as UserStatus)
  );
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
  projectCount: number;
  capacity: number;
};

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
    if (password && password.length < 8) {
      return { error: "登录密码至少需要 8 个字符。" };
    }
    if (password.length > 128) {
      return { error: "登录密码不能超过 128 个字符。" };
    }
    data.password = password;
  }

  if (!partial || "projectCount" in input) {
    const projectCount = Number(input.projectCount ?? 0);
    if (!Number.isInteger(projectCount) || projectCount < 0 || projectCount > 999) {
      return { error: "项目数量必须是 0 至 999 的整数。" };
    }
    data.projectCount = projectCount;
  }

  if (!partial || "capacity" in input) {
    const capacity = Number(input.capacity ?? 0);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100) {
      return { error: "容量使用率必须是 0 至 100 的整数。" };
    }
    data.capacity = capacity;
  }

  return { data };
}

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
