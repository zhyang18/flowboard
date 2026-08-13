import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRoleDefinitionInput,
  parseRolePermissions,
  systemRoleDefinitions,
} from "../lib/roles";
import {
  canBeTaskDeveloper,
  canBeTaskTester,
  canApproveWorkLogs,
  canContributeToProject,
  canCreateProjects,
  canManageUsers,
  canManageTasksInProject,
  canUploadAttachmentDraft,
} from "../lib/authorization";
import { isUserSortKey } from "../lib/users";

test("系统角色定义包含唯一标识和完整权限", () => {
  assert.equal(systemRoleDefinitions.length, 5);
  assert.equal(new Set(systemRoleDefinitions.map((role) => role.id)).size, 5);
  for (const role of systemRoleDefinitions) {
    const parsed = parseRolePermissions(role.permissions);
    assert.deepEqual(parsed.data, role.permissions);
    assert.equal(parsed.error, undefined);
  }
});

test("角色输入会拒绝缺失权限和无效权限基线", () => {
  const missingPermission = parseRoleDefinitionInput({
    name: "交付负责人",
    description: "负责交付协调",
    baseRole: "member",
    tone: "blue",
    permissions: { manageTasks: true },
  });
  assert.match(missingPermission.error ?? "", /权限/);

  const invalidBaseRole = parseRoleDefinitionInput({
    name: "交付负责人",
    description: "负责交付协调",
    baseRole: "owner",
    tone: "blue",
    permissions: systemRoleDefinitions[2].permissions,
  });
  assert.equal(invalidBaseRole.error, "权限基线无效。");
});

test("用户表头排序只接受受支持字段", () => {
  assert.equal(isUserSortKey("name"), true);
  assert.equal(isUserSortKey("lastSeenAt"), true);
  assert.equal(isUserSortKey("passwordHash"), false);
  assert.equal(isUserSortKey(null), false);
});

test("自定义角色权限会限制组织入口和任务写入", () => {
  const restrictedManager = {
    id: "manager-1",
    role: "project_admin" as const,
    permissions: {
      manageProjects: false,
      manageUsers: false,
      manageTasks: false,
      approveWorkLogs: false,
      exportReports: false,
      viewAudit: false,
    },
  };
  assert.equal(canManageUsers(restrictedManager), false);
  assert.equal(canCreateProjects(restrictedManager), false);
  assert.equal(
    canContributeToProject(restrictedManager, {
      projectId: "project-1",
      ownerId: "manager-1",
      archived: false,
      memberRole: "manager",
    }),
    false,
  );
  assert.equal(
    canApproveWorkLogs(restrictedManager, {
      projectId: "project-1",
      ownerId: "manager-1",
      archived: false,
      memberRole: "manager",
    }),
    false,
  );
  assert.equal(canBeTaskDeveloper(restrictedManager), false);
  assert.equal(canUploadAttachmentDraft(restrictedManager), false);
  assert.equal(
    canManageTasksInProject(restrictedManager, {
      projectId: "project-1",
      ownerId: "manager-1",
      archived: false,
      memberRole: "manager",
    }),
    false,
  );
});

test("任务负责人资格同时遵循基础角色和自定义任务权限", () => {
  const taskPermissions = systemRoleDefinitions[2].permissions;
  assert.equal(
    canBeTaskDeveloper({ role: "member", permissions: taskPermissions }),
    true,
  );
  assert.equal(
    canBeTaskTester({
      role: "tester",
      permissions: systemRoleDefinitions[3].permissions,
    }),
    true,
  );
  assert.equal(
    canBeTaskTester({
      role: "tester",
      permissions: {
        manageProjects: false,
        manageUsers: false,
        manageTasks: false,
        approveWorkLogs: false,
        exportReports: false,
        viewAudit: false,
      },
    }),
    false,
  );
  assert.equal(
    canBeTaskDeveloper({ role: "viewer", permissions: taskPermissions }),
    false,
  );
});
