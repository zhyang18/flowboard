import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPeriodTrend,
  countWeekdays,
  dateKeyInTimeZone,
  startOfUtcDay,
} from "../lib/reporting";

test("startOfUtcDay 会清除时间部分", () => {
  assert.equal(
    startOfUtcDay(new Date("2026-08-07T16:30:00Z")).toISOString(),
    "2026-08-07T00:00:00.000Z",
  );
});

test("countWeekdays 会排除周六和周日", () => {
  assert.equal(
    countWeekdays(
      new Date("2026-08-03T00:00:00Z"),
      new Date("2026-08-09T00:00:00Z"),
    ),
    5,
  );
});

test("dateKeyInTimeZone 会遵循工作空间时区", () => {
  const instant = new Date("2026-08-07T17:30:00Z");
  assert.equal(dateKeyInTimeZone(instant, "Asia/Singapore"), "2026-08-08");
  assert.equal(dateKeyInTimeZone(instant, "UTC"), "2026-08-07");
});

test("buildPeriodTrend 会将周期工时完整且仅汇总一次", () => {
  const result = buildPeriodTrend(
    [
      { workDate: new Date("2026-08-01T00:00:00Z"), durationHours: 2.5 },
      { workDate: new Date("2026-08-05T00:00:00Z"), durationHours: 3 },
      { workDate: new Date("2026-08-07T00:00:00Z"), durationHours: 1.5 },
      { workDate: new Date("2026-07-01T00:00:00Z"), durationHours: 99 },
    ],
    new Date("2026-08-07T12:00:00Z"),
    7,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].hours, 7);
});
