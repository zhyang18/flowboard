import type {
  Project,
  ProjectStatus,
  Sprint,
  SprintStatus,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/db/schema";

export const projectStatusLabels: Record<ProjectStatus, string> = {
  planning: "规划中",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  backlog: "需求池",
  todo: "待处理",
  in_progress: "进行中",
  review: "待验收",
  done: "已完成",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

export const sprintStatusLabels: Record<SprintStatus, string> = {
  planned: "未开始",
  active: "进行中",
  completed: "已完成",
};

export const taskStatuses = Object.keys(
  taskStatusLabels,
) as TaskStatus[];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === "string" &&
    value in projectStatusLabels
  );
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && value in taskStatusLabels;
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && value in taskPriorityLabels;
}

export function isSprintStatus(value: unknown): value is SprintStatus {
  return typeof value === "string" && value in sprintStatusLabels;
}

export function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function serializeProject(project: Project) {
  return {
    ...project,
    startDate: project.startDate?.toISOString() ?? null,
    dueDate: project.dueDate?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function serializeTask(task: Task) {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function serializeSprint(sprint: Sprint) {
  return {
    ...sprint,
    startDate: sprint.startDate.toISOString(),
    endDate: sprint.endDate.toISOString(),
    createdAt: sprint.createdAt.toISOString(),
    updatedAt: sprint.updatedAt.toISOString(),
  };
}

export function safeHours(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.max(0, Math.min(number, 10_000)) * 10) / 10;
}

export function projectCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20)
    : "";
}
