import assert from "node:assert/strict";
import test from "node:test";
import {
  canBackfillCompletedTaskWork,
  canDeleteWorkLog,
  canRecordTaskWork,
  hasRecordedActualHours,
} from "../lib/work-logs";

test("只有任务指定开发人员可以登记实际工时", () => {
  assert.equal(canRecordTaskWork("developer-1", "developer-1"), true);
  assert.equal(canRecordTaskWork("developer-2", "developer-1"), false);
  assert.equal(canRecordTaskWork("developer-1", null), false);
});

test("任务只有登记实际工时后才能完成", () => {
  assert.equal(hasRecordedActualHours(0), false);
  assert.equal(hasRecordedActualHours(0.5), true);
});

test("已完成任务不能删除最后一条工时明细", () => {
  assert.equal(canDeleteWorkLog("done", 2, 2), false);
  assert.equal(canDeleteWorkLog("done", 3, 2), true);
  assert.equal(canDeleteWorkLog("in_progress", 2, 2), true);
});

test("指定开发人员可以为旧的已完成零工时任务补录一次工时", () => {
  assert.equal(canBackfillCompletedTaskWork("completed", "done", 0, true), true);
  assert.equal(canBackfillCompletedTaskWork("completed", "done", 2, true), false);
  assert.equal(canBackfillCompletedTaskWork("completed", "done", 0, false), false);
  assert.equal(canBackfillCompletedTaskWork("active", "done", 0, true), false);
});
