import assert from "node:assert/strict";
import test from "node:test";
import {
  canApproveTaskCompletion,
  canAssignTaskAssignee,
  canEditTask,
  canExportReports,
  canManageProject,
  canPermanentlyDeleteProject,
  canRestoreProject,
  type ProjectAccess,
} from "../lib/authorization";
import {
  hasOtherActiveSprint,
  isCompletedSprintStatus,
  projectLifecycleLockQueries,
} from "../lib/sprints";
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

test("已完成迭代被识别为历史快照且项目锁会去重", () => {
  assert.equal(isCompletedSprintStatus("completed"), true);
  assert.equal(isCompletedSprintStatus("active"), false);
  assert.equal(isCompletedSprintStatus(null), false);
  assert.equal(
    projectLifecycleLockQueries(["project-2", "project-1", "project-2"]).length,
    2,
  );
});

test("只有管理员角色可以导出报表", () => {
  assert.equal(canExportReports({ role: "super_admin" }), true);
  assert.equal(canExportReports({ role: "project_admin" }), true);
  assert.equal(canExportReports({ role: "member" }), false);
  assert.equal(canExportReports({ role: "tester" }), false);
  assert.equal(canExportReports({ role: "viewer" }), false);
});

test("归档项目可由项目管理者恢复且只能由超级管理员永久删除", () => {
  const archivedAccess = { ...projectAccess, archived: true, memberRole: "manager" as const };
  assert.equal(
    canRestoreProject({ id: "manager-1", role: "member" }, archivedAccess),
    true,
  );
  assert.equal(
    canRestoreProject({ id: "tester-1", role: "tester" }, archivedAccess),
    false,
  );
  assert.equal(canPermanentlyDeleteProject({ role: "super_admin" }, archivedAccess), true);
  assert.equal(canPermanentlyDeleteProject({ role: "project_admin" }, archivedAccess), false);
  assert.equal(
    canPermanentlyDeleteProject({ role: "super_admin" }, { ...archivedAccess, archived: false }),
    false,
  );
});
