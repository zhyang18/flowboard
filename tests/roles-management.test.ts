import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSystemRoles,
  permissionRows,
  validateRoleInput,
} from "../lib/roles";

test("默认系统内置角色定义完整且具有预设属性", () => {
  assert.equal(defaultSystemRoles.length, 5);
  const superAdmin = defaultSystemRoles.find((r) => r.id === "super_admin");
  assert.ok(superAdmin);
  assert.equal(superAdmin?.isSystem, true);
  assert.equal(superAdmin?.permissions.length, permissionRows.length);
  assert.ok(superAdmin?.permissions.every((p) => p === true));

  const viewer = defaultSystemRoles.find((r) => r.id === "viewer");
  assert.ok(viewer);
  assert.equal(viewer?.isSystem, true);
  assert.ok(viewer?.permissions.every((p) => p === false));
});

test("角色输入校验逻辑正确处理合法与非法参数", () => {
  // 名称为空校验
  assert.equal(validateRoleInput({ name: "" }), "角色名称不能为空。");
  assert.equal(validateRoleInput({ name: "   " }), "角色名称不能为空。");

  // 名称超长校验
  assert.equal(
    validateRoleInput({ name: "a".repeat(31) }),
    "角色名称长度不能超过 30 个字符。",
  );

  // 描述超长校验
  assert.equal(
    validateRoleInput({ name: "有效名称", description: "d".repeat(201) }),
    "角色描述不能超过 200 个字符。",
  );

  // 主题色调校验
  assert.equal(
    validateRoleInput({ name: "有效名称", tone: "invalid_tone" }),
    "角色主题色调无效。",
  );

  // 权限数组长度不匹配校验
  assert.equal(
    validateRoleInput({ name: "有效名称", permissions: [true, false] }),
    `权限配置必须包含 ${permissionRows.length} 项权限。`,
  );

  // 完全合法
  assert.equal(
    validateRoleInput({
      name: "架构师",
      description: "负责核心架构设计与评审",
      tone: "violet",
      permissions: [true, true, true, false, false, false],
    }),
    "",
  );
});

test("权限项数量与定义严格一致", () => {
  assert.equal(permissionRows.length, 6);
  assert.deepEqual([...permissionRows], [
    "项目设置",
    "用户与团队",
    "任务管理",
    "工时审批",
    "报表导出",
    "系统审计",
  ]);
});
