import assert from "node:assert/strict";
import test from "node:test";
import { canEditTask, type ProjectAccess } from "../lib/authorization";
import { canOwnProject, projectMemberRoleForUser } from "../lib/users";

const projectAccess: ProjectAccess = {
  projectId: "project-1",
  ownerId: "owner-1",
  archived: false,
  memberRole: "tester",
};

test("测试人员不能担任项目负责人并映射为测试项目成员", () => {
  assert.equal(canOwnProject("tester"), false);
  assert.equal(projectMemberRoleForUser("tester", false), "tester");
  assert.equal(projectMemberRoleForUser("member", true), "manager");
});

test("测试人员只能编辑由自己负责验收的任务", () => {
  const user = { id: "tester-1", role: "tester" as const };
  assert.equal(
    canEditTask(user, projectAccess, {
      assigneeId: "developer-1",
      testerId: "tester-1",
      reporterId: "owner-1",
    }),
    true,
  );
  assert.equal(
    canEditTask(user, projectAccess, {
      assigneeId: "tester-1",
      testerId: "tester-2",
      reporterId: "tester-1",
    }),
    false,
  );
});

test("研发成员仍按开发负责人或创建人关系编辑任务", () => {
  const user = { id: "developer-1", role: "member" as const };
  assert.equal(
    canEditTask(user, { ...projectAccess, memberRole: "member" }, {
      assigneeId: "developer-1",
      testerId: "tester-1",
      reporterId: "owner-1",
    }),
    true,
  );
});
