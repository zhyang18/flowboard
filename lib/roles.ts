import { sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { customRoles, users } from "@/db/schema";

/**
 * 权限定义项数组，按固定索引顺序排列
 */
export const permissionRows = [
  "项目设置",
  "用户与团队",
  "任务管理",
  "工时审批",
  "报表导出",
  "系统审计",
] as const;

/**
 * 角色定义结构
 */
export type RoleDefinition = {
  /** 角色唯一标识符 */
  id: string;
  /** 角色显示名称 */
  name: string;
  /** 角色功能描述 */
  description: string;
  /** 角色卡片主题色 */
  tone: string;
  /** 权限开启布尔数组，顺序与 permissionRows 一致 */
  permissions: boolean[];
  /** 是否为系统内置角色 */
  isSystem: boolean;
  /** 当前绑定该角色的用户数量 */
  userCount?: number;
  /** 创建时间 ISO 字符串 */
  createdAt?: string;
  /** 更新时间 ISO 字符串 */
  updatedAt?: string;
};

/**
 * 系统默认内置的 5 种角色模板配置
 */
export const defaultSystemRoles: RoleDefinition[] = [
  {
    id: "super_admin",
    name: "超级管理员",
    description: "管理组织、权限、审计及全部项目",
    tone: "violet",
    permissions: [true, true, true, true, true, true],
    isSystem: true,
  },
  {
    id: "project_admin",
    name: "项目管理员",
    description: "管理指定项目、成员、迭代和报表",
    tone: "blue",
    permissions: [true, true, true, true, true, false],
    isSystem: true,
  },
  {
    id: "member",
    name: "研发成员",
    description: "处理任务、记录工时并参与项目协作",
    tone: "green",
    permissions: [false, false, true, false, false, false],
    isSystem: true,
  },
  {
    id: "tester",
    name: "测试人员",
    description: "负责迭代验证、任务验收并登记测试工时",
    tone: "violet",
    permissions: [false, false, true, false, false, false],
    isSystem: true,
  },
  {
    id: "viewer",
    name: "只读访客",
    description: "查看获授权的项目与公开报表",
    tone: "gray",
    permissions: [false, false, false, false, false, false],
    isSystem: true,
  },
];

/**
 * 确保数据库中已存在默认系统角色数据，并在表不存在时自动安全建表。
 *
 * @param db 数据库实例。
 * @return 异步执行完成后的 Promise。
 */
export async function ensureRolesTableAndDefaults(db: ReturnType<typeof getDb>): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS custom_roles (
      id text PRIMARY KEY,
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      tone text NOT NULL DEFAULT 'blue',
      permissions jsonb NOT NULL,
      is_system boolean NOT NULL DEFAULT false,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `);

  for (const role of defaultSystemRoles) {
    await db.execute(sql`
      INSERT INTO custom_roles (id, name, description, tone, permissions, is_system, created_at, updated_at)
      VALUES (${role.id}, ${role.name}, ${role.description}, ${role.tone}, ${JSON.stringify(role.permissions)}::jsonb, true, now(), now())
      ON CONFLICT (id) DO NOTHING;
    `);
  }
}

/**
 * 获取所有角色列表及每个角色的关联用户数统计。
 *
 * @param db 数据库实例。
 * @return 包含系统角色与自定义角色的完整角色列表 Promise。
 */
export async function getAllRoles(db: ReturnType<typeof getDb>): Promise<RoleDefinition[]> {
  await ensureRolesTableAndDefaults(db);

  const [dbRoleRows, userRoleCounts] = await Promise.all([
    db.select().from(customRoles),
    db
      .select({
        role: users.role,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .groupBy(users.role),
  ]);

  const countMap = new Map<string, number>();
  for (const row of userRoleCounts) {
    countMap.set(row.role, row.count);
  }

  const roleList: RoleDefinition[] = dbRoleRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    tone: r.tone,
    permissions: Array.isArray(r.permissions) ? (r.permissions as boolean[]) : [false, false, false, false, false, false],
    isSystem: r.isSystem,
    userCount: countMap.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  // 保证排序：系统内置角色按默认先后排列，自定义角色按创建时间正序排在后面
  const systemRoleOrder = defaultSystemRoles.map((item) => item.id);
  roleList.sort((a, b) => {
    const aIndex = systemRoleOrder.indexOf(a.id);
    const bIndex = systemRoleOrder.indexOf(b.id);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });

  return roleList;
}

/**
 * 校验角色输入参数合法性。
 *
 * @param data 待校验的角色数据。
 * @return 校验通过返回空字符串，校验不通过返回错误说明。
 */
export function validateRoleInput(data: {
  name?: unknown;
  description?: unknown;
  tone?: unknown;
  permissions?: unknown;
}): string {
  if (typeof data.name !== "string" || !data.name.trim()) {
    return "角色名称不能为空。";
  }
  if (data.name.trim().length > 30) {
    return "角色名称长度不能超过 30 个字符。";
  }
  if (data.description && typeof data.description === "string" && data.description.length > 200) {
    return "角色描述不能超过 200 个字符。";
  }
  if (data.tone && typeof data.tone === "string") {
    const validTones = ["violet", "blue", "green", "orange", "gray", "rose", "cyan"];
    if (!validTones.includes(data.tone)) {
      return "角色主题色调无效。";
    }
  }
  if (data.permissions !== undefined) {
    if (!Array.isArray(data.permissions) || data.permissions.length !== permissionRows.length) {
      return `权限配置必须包含 ${permissionRows.length} 项权限。`;
    }
  }
  return "";
}
