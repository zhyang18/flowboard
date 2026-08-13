export type DatedHours = { workDate: Date; durationHours: number };

/**
 * 按指定 IANA 时区生成稳定的 YYYY-MM-DD 日期键。
 *
 * @param value 需要格式化的时间。
 * @param timeZone IANA 时区名称。
 * @return 指定时区下的日期键。
 */
export function dateKeyInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

/**
 * 将日期归一化到 UTC 当天零点。
 *
 * @param value 任意时间。
 * @return 对应 UTC 日期的零点时间。
 */
export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * 统计一段日期内的工作日数量。
 *
 * @param from 起始日期，包含当天。
 * @param to 结束日期，包含当天。
 * @return 周一至周五的天数。
 */
export function countWeekdays(from: Date, to: Date): number {
  let count = 0;
  const cursor = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * 生成以工作空间本地日期为终点的滚动 UTC 日期区间。
 *
 * @param now 当前时间点。
 * @param timeZone 工作空间 IANA 时区。
 * @param days 需要包含的自然日数量。
 * @return 可用于日期型工时查询的起止 UTC 零点。
 */
export function rollingDateRange(
  now: Date,
  timeZone: string,
  days: number,
): { from: Date; to: Date } {
  const safeDays = Math.max(1, Math.trunc(days));
  const to = new Date(`${dateKeyInTimeZone(now, timeZone)}T00:00:00.000Z`);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - safeDays + 1);
  return { from, to };
}

/**
 * 将选定周期压缩成最多六个连续趋势桶。
 *
 * @param logs 包含日期和工时的明细。
 * @param referenceDate 报表参考日期。
 * @param periodDays 报表周期天数。
 * @return 按时间升序排列的趋势数据。
 */
export function buildPeriodTrend(
  logs: DatedHours[],
  referenceDate: Date,
  periodDays: number,
): Array<{ label: string; hours: number }> {
  const end = startOfUtcDay(referenceDate);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - periodDays + 1);
  const bucketCount = Math.min(6, Math.max(1, Math.ceil(periodDays / 7)));
  const bucketDays = Math.ceil(periodDays / bucketCount);
  const buckets: Array<{ start: Date; end: Date; label: string; hours: number }> = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = new Date(start);
    bucketStart.setUTCDate(start.getUTCDate() + index * bucketDays);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setUTCDate(bucketStart.getUTCDate() + bucketDays - 1);
    if (bucketEnd > end) bucketEnd.setTime(end.getTime());
    buckets.push({
      start: bucketStart,
      end: bucketEnd,
      label: `${bucketStart.getUTCMonth() + 1}/${bucketStart.getUTCDate()}`,
      hours: 0,
    });
  }

  for (const log of logs) {
    const workDay = startOfUtcDay(log.workDate);
    const bucket = buckets.find((item) => workDay >= item.start && workDay <= item.end);
    if (bucket) bucket.hours += log.durationHours;
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    hours: Math.round(bucket.hours * 10) / 10,
  }));
}
