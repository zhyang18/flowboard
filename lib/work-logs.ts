import type { SprintStatus, TaskStatus } from "@/db/schema";

const HOURS_EPSILON = 0.0001;

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
 * @param managesProject 当前用户是否管理该项目。
 * @return 仅项目管理者处理已完成且零工时的历史任务时返回 true。
 */
export function canBackfillCompletedTaskWork(
  sprintStatus: SprintStatus | null,
  taskStatus: TaskStatus,
  actualHours: number,
  managesProject: boolean,
): boolean {
  return (
    sprintStatus === "completed" &&
    taskStatus === "done" &&
    !hasRecordedActualHours(actualHours) &&
    managesProject
  );
}
