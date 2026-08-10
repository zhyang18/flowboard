import assert from "node:assert/strict";
import test from "node:test";
import {
  canApproveTaskCompletion,
  canAssignTaskAssignee,
  canEditTask,
  canManageProject,
  type ProjectAccess,
} from "../lib/authorization";
import { hasOtherActiveSprint } from "../lib/sprints";
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

test("普通成员只能给自己认领新任务，项目管理者可指派其他成员", () => {
  const member = { id: "developer-1", role: "member" as const };
  const memberAccess = { ...projectAccess, memberRole: "member" as const };
  assert.equal(canAssignTaskAssignee(member, memberAccess, null), true);
  assert.equal(canAssignTaskAssignee(member, memberAccess, "developer-1"), true);
  assert.equal(canAssignTaskAssignee(member, memberAccess, "developer-2"), false);

  const owner = { id: "owner-1", role: "member" as const };
  assert.equal(canAssignTaskAssignee(owner, memberAccess, "developer-2"), true);
});

test("带测试负责人的任务只能由测试人员或项目管理者验收完成", () => {
  const task = {
    assigneeId: "developer-1",
    testerId: "tester-1",
    reporterId: "owner-1",
  };
  assert.equal(
    canApproveTaskCompletion(
      { id: "developer-1", role: "member" },
      { ...projectAccess, memberRole: "member" },
      task,
    ),
    false,
  );
  assert.equal(
    canApproveTaskCompletion(
      { id: "tester-1", role: "tester" },
      projectAccess,
      task,
    ),
    true,
  );
});

test("归档项目不可继续维护且同项目只能有一个进行中迭代", () => {
  assert.equal(
    canManageProject(
      { id: "owner-1", role: "member" },
      { ...projectAccess, ownerId: "owner-1", archived: true },
    ),
    false,
  );
  assert.equal(hasOtherActiveSprint(["sprint-1"], null), true);
  assert.equal(hasOtherActiveSprint(["sprint-1"], "sprint-1"), false);
  assert.equal(hasOtherActiveSprint(["sprint-1", "sprint-2"], "sprint-1"), true);
});
