import type { SprintStatus, TaskStatus } from "@/db/schema";

const HOURS_EPSILON = 0.0001;

/**
 * 判断当前用户是否是任务指定的开发负责人。
 *
 * @param userId 当前登录用户 ID。
 * @param assigneeId 任务指定的开发负责人 ID。
 * @return 当前用户是指定开发负责人时返回 true。
 */
export function canRecordTaskWork(
  userId: string,
  assigneeId: string | null,
): boolean {
  return assigneeId !== null && assigneeId === userId;
}

/**
 * 判断任务是否已经产生可计入交付的实际工时。
 *
 * @param actualHours 任务当前汇总的实际工时。
 * @return 实际工时大于零时返回 true。
 */
export function hasRecordedActualHours(actualHours: number): boolean {
  return actualHours > HOURS_EPSILON;
}

/**
 * 判断删除一条工时后是否仍满足已完成任务必须保留实际投入的规则。
 *
 * @param status 任务当前状态。
 * @param actualHours 任务当前汇总的实际工时。
 * @param deletedHours 待删除明细的工时。
 * @return 非已完成任务始终返回 true；已完成任务仍有实际工时时返回 true。
 */
export function canDeleteWorkLog(
  status: TaskStatus,
  actualHours: number,
  deletedHours: number,
): boolean {
  return status !== "done" || actualHours - deletedHours > HOURS_EPSILON;
}

/**
 * 判断是否允许为旧的已完成迭代补录缺失的任务工时。
 *
 * @param sprintStatus 任务所属迭代状态，未规划任务为 null。
 * @param taskStatus 任务当前状态。
 * @param actualHours 任务当前汇总的实际工时。
 * @param isAssignedDeveloper 当前用户是否是任务指定开发负责人。
 * @return 仅指定开发负责人处理已完成且零工时的历史任务时返回 true。
 */
export function canBackfillCompletedTaskWork(
  sprintStatus: SprintStatus | null,
  taskStatus: TaskStatus,
  actualHours: number,
  isAssignedDeveloper: boolean,
): boolean {
  return (
    sprintStatus === "completed" &&
    taskStatus === "done" &&
    !hasRecordedActualHours(actualHours) &&
    isAssignedDeveloper
  );
}
