import type { RolePermissions, UserRole } from "@/db/schema";
import { SYSTEM_ROLE_DEFINITION_IDS } from "@/db/schema";
import { textValue } from "./api";
import { isUserRole } from "./users";

export const rolePermissionDefinitions: Array<{
  key: keyof RolePermissions;
  label: string;
  description: string;
}> = [
  { key: "manageProjects", label: "项目设置", description: "创建项目并维护项目设置" },
  { key: "manageUsers", label: "用户与团队", description: "查看并维护组织用户" },
  { key: "manageTasks", label: "任务管理", description: "在授权项目内维护任务" },
  { key: "approveWorkLogs", label: "工时审批", description: "审核团队工时记录" },
  { key: "exportReports", label: "报表导出", description: "导出项目和效能报表" },
  { key: "viewAudit", label: "系统审计", description: "查看组织级审计信息" },
];

export const roleTones = ["violet", "blue", "green", "orange", "gray"] as const;
export type RoleTone = (typeof roleTones)[number];

export type RoleDefinitionInput = {
  name: string;
  description: string;
  baseRole: UserRole;
  permissions: RolePermissions;
  tone: RoleTone;
};

export const systemRoleDefinitions: Array<
  RoleDefinitionInput & { id: string; code: UserRole; isSystem: true }
> = [
  {
    id: SYSTEM_ROLE_DEFINITION_IDS.super_admin,
    code: "super_admin",
    name: "超级管理员",
    description: "管理组织、权限、审计及全部项目",
    baseRole: "super_admin",
    permissions: {
      manageProjects: true,
      manageUsers: true,
      manageTasks: true,
      approveWorkLogs: true,
      exportReports: true,
      viewAudit: true,
    },
    tone: "violet",
    isSystem: true,
  },
  {
    id: SYSTEM_ROLE_DEFINITION_IDS.project_admin,
    code: "project_admin",
    name: "项目管理员",
    description: "管理指定项目、成员、迭代和报表",
    baseRole: "project_admin",
    permissions: {
      manageProjects: true,
      manageUsers: true,
      manageTasks: true,
      approveWorkLogs: true,
      exportReports: true,
      viewAudit: false,
    },
    tone: "blue",
    isSystem: true,
  },
  {
    id: SYSTEM_ROLE_DEFINITION_IDS.member,
    code: "member",
    name: "研发成员",
    description: "处理任务、记录工时并参与项目协作",
    baseRole: "member",
    permissions: {
      manageProjects: false,
      manageUsers: false,
      manageTasks: true,
      approveWorkLogs: false,
      exportReports: false,
      viewAudit: false,
    },
    tone: "green",
    isSystem: true,
  },
  {
    id: SYSTEM_ROLE_DEFINITION_IDS.tester,
    code: "tester",
    name: "测试人员",
    description: "负责迭代验证、任务验收并登记测试工时",
    baseRole: "tester",
    permissions: {
      manageProjects: false,
      manageUsers: false,
      manageTasks: true,
      approveWorkLogs: false,
      exportReports: false,
      viewAudit: false,
    },
    tone: "violet",
    isSystem: true,
  },
  {
    id: SYSTEM_ROLE_DEFINITION_IDS.viewer,
    code: "viewer",
    name: "只读访客",
    description: "查看获授权的项目与公开报表",
    baseRole: "viewer",
    permissions: {
      manageProjects: false,
      manageUsers: false,
      manageTasks: false,
      approveWorkLogs: false,
      exportReports: false,
      viewAudit: false,
    },
    tone: "gray",
    isSystem: true,
  },
];

/**
 * 判断未知值是否为角色卡片支持的颜色主题。
 *
 * @param value 待校验的颜色主题。
 * @return 属于支持范围时返回 true。
 */
export function isRoleTone(value: unknown): value is RoleTone {
  return typeof value === "string" && roleTones.includes(value as RoleTone);
}

/**
 * 校验角色权限对象并补齐稳定的权限字段。
 *
 * @param value 客户端提交的权限对象。
 * @return 规范化后的权限或校验错误。
 */
export function parseRolePermissions(
  value: unknown,
): { data?: RolePermissions; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "请选择角色权限。" };
  }
  const input = value as Record<string, unknown>;
  const permissions = {} as RolePermissions;
  for (const permission of rolePermissionDefinitions) {
    if (typeof input[permission.key] !== "boolean") {
      return { error: `权限“${permission.label}”的值无效。` };
    }
    permissions[permission.key] = input[permission.key] as boolean;
  }
  return { data: permissions };
}

/**
 * 校验并规范化角色新增或编辑输入。
 *
 * @param input 客户端提交的角色字段。
 * @return 规范化后的角色数据或校验错误。
 */
export function parseRoleDefinitionInput(
  input: Record<string, unknown>,
): { data?: RoleDefinitionInput; error?: string } {
  const name = textValue(input.name, 40);
  if (name.length < 2) return { error: "角色名称至少需要 2 个字符。" };
  const description = textValue(input.description, 160);
  if (!description) return { error: "请输入角色说明。" };
  if (!isUserRole(input.baseRole)) return { error: "权限基线无效。" };
  if (!isRoleTone(input.tone)) return { error: "角色颜色无效。" };
  const permissions = parseRolePermissions(input.permissions);
  if (!permissions.data || permissions.error) return { error: permissions.error };
  return {
    data: {
      name,
      description,
      baseRole: input.baseRole,
      permissions: permissions.data,
      tone: input.tone,
    },
  };
}
