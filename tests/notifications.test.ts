import assert from "node:assert/strict";
import test from "node:test";
import type { NotificationTaskInput } from "@/lib/notifications";
import { buildTaskNotifications } from "@/lib/notifications";

const now = new Date("2026-08-10T08:00:00.000Z");

/**
 * 创建可按场景覆盖字段的任务提醒测试数据。
 *
 * @param overrides 需要覆盖的任务字段。
 * @return 完整任务提醒输入。
 */
function task(overrides: Partial<NotificationTaskInput> = {}): NotificationTaskInput {
  return {
    id: "task-1",
    title: "联调消息中心",
    status: "in_progress",
    projectCode: "FLOW",
    dueDate: null,
    estimateHours: 4,
    actualHours: 2,
    updatedAt: new Date("2026-08-10T07:00:00.000Z"),
    ...overrides,
  };
}

test("逾期提醒优先于同一任务的工时超支提醒", () => {
  const result = buildTaskNotifications([
    task({
      dueDate: new Date("2026-08-08T08:00:00.000Z"),
      actualHours: 6,
    }),
  ], { now, notifyOverdue: true, timeZone: "Asia/Singapore" });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.kind, "overdue");
  assert.match(result[0]?.detail ?? "", /已逾期 2 天/);
});

test("关闭逾期提醒后不会把已过期任务误报为临期", () => {
  const result = buildTaskNotifications([
    task({ dueDate: new Date("2026-08-09T08:00:00.000Z") }),
  ], { now, notifyOverdue: false, timeZone: "Asia/Singapore" });

  assert.deepEqual(result, []);
});

test("待验收和三天内到期任务会生成对应消息", () => {
  const result = buildTaskNotifications([
    task({ id: "review", status: "review" }),
    task({ id: "soon", dueDate: new Date("2026-08-12T08:00:00.000Z") }),
  ], { now, notifyOverdue: true, timeZone: "Asia/Singapore" });

  assert.deepEqual(result.map((item) => item.kind), ["review", "due_soon"]);
});
