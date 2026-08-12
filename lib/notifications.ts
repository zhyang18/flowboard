import type { TaskStatus } from "@/db/schema";

export type NotificationKind = "overdue" | "review" | "overrun" | "due_soon" | "rejected";

export type DashboardNotification = {
  id: string;
  kind: NotificationKind;
  label: string;
  title: string;
  detail: string;
  timeLabel: string;
  href: string;
  occurredAt: string;
  persistent?: boolean;
};

export type NotificationTaskInput = {
  id: string;
  title: string;
  status: TaskStatus;
  projectCode: string;
  dueDate: Date | null;
  estimateHours: number;
  actualHours: number;
  updatedAt: Date;
};

type BuildNotificationOptions = {
  now: Date;
  notifyOverdue: boolean;
  timeZone: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const kindOrder: Record<NotificationKind, number> = {
  rejected: 0,
  overdue: 1,
  review: 2,
  overrun: 3,
  due_soon: 4,
};

/**
 * 按工作空间时区格式化提醒时间。
 *
 * @param value 需要格式化的时间。
 * @param timeZone 工作空间时区。
 * @return 月日和时分组成的简短文本。
 */
function notificationTimeLabel(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

/**
 * 将任务状态转换为一条当前需要处理的消息提醒。
 *
 * @param task 可用于判断交付风险的任务数据。
 * @param options 当前时间、提醒开关与工作空间时区。
 * @return 需要提醒时返回消息，否则返回 null。
 */
function buildTaskNotification(
  task: NotificationTaskInput,
  options: BuildNotificationOptions,
): DashboardNotification | null {
  const { now, notifyOverdue, timeZone } = options;
  const dueDifference = task.dueDate
    ? task.dueDate.getTime() - now.getTime()
    : null;
  let kind: NotificationKind | null = null;
  let label = "";
  let detail = "";
  let occurredAt = task.updatedAt;

  if (task.dueDate && dueDifference !== null && dueDifference < 0 && notifyOverdue) {
    const overdueDays = Math.max(1, Math.ceil(Math.abs(dueDifference) / DAY_MS));
    kind = "overdue";
    label = "任务逾期";
    detail = `${task.projectCode} · 已逾期 ${overdueDays} 天`;
    occurredAt = task.dueDate;
  } else if (task.status === "review") {
    kind = "review";
    label = "等待验收";
    detail = `${task.projectCode} · 已进入待验收阶段`;
  } else if (task.estimateHours > 0 && task.actualHours > task.estimateHours) {
    kind = "overrun";
    label = "工时超支";
    detail = `${task.projectCode} · 已用 ${task.actualHours}h / 预估 ${task.estimateHours}h`;
  } else if (
    task.dueDate &&
    dueDifference !== null &&
    dueDifference >= 0 &&
    dueDifference <= 3 * DAY_MS
  ) {
    kind = "due_soon";
    label = "即将到期";
    detail = `${task.projectCode} · ${notificationTimeLabel(task.dueDate, timeZone)} 截止`;
    occurredAt = task.dueDate;
  }

  if (!kind) return null;

  return {
    id: `${kind}-${task.id}`,
    kind,
    label,
    title: task.title,
    detail,
    timeLabel: notificationTimeLabel(occurredAt, timeZone),
    href: `/dashboard/board?taskId=${task.id}`,
    occurredAt: occurredAt.toISOString(),
  };
}

/**
 * 从当前用户可见任务中生成按风险优先级排序的消息提醒。
 *
 * @param tasks 当前用户可见且尚未完成的任务。
 * @param options 当前时间、提醒开关与工作空间时区。
 * @return 排序后的消息提醒列表。
 */
export function buildTaskNotifications(
  tasks: NotificationTaskInput[],
  options: BuildNotificationOptions,
) {
  return tasks
    .map((task) => buildTaskNotification(task, options))
    .filter((item): item is DashboardNotification => item !== null)
    .sort((left, right) => {
      const kindDifference = kindOrder[left.kind] - kindOrder[right.kind];
      if (kindDifference !== 0) return kindDifference;
      return new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
    });
}
