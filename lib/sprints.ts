import { sql, type SQL } from "drizzle-orm";
import type { SprintStatus } from "@/db/schema";

/**
 * 判断项目中是否存在当前迭代之外的进行中迭代。
 *
 * @param activeSprintIds 项目内当前处于进行中的迭代 ID 列表。
 * @param currentSprintId 正在更新的迭代 ID；创建迭代时传入 null。
 * @return 存在其他进行中迭代时返回 true。
 */
export function hasOtherActiveSprint(
  activeSprintIds: string[],
  currentSprintId: string | null,
): boolean {
  return activeSprintIds.some((id) => id !== currentSprintId);
}

/**
 * 判断迭代状态是否代表不可直接改写的历史快照。
 *
 * @param status 当前迭代状态，未加入迭代时为 null。
 * @return 已完成迭代返回 true，否则返回 false。
 */
export function isCompletedSprintStatus(status: SprintStatus | null): boolean {
  return status === "completed";
}

/**
 * 判断迭代是否允许从当前状态流转到目标状态。
 *
 * @param currentStatus 当前迭代状态。
 * @param targetStatus 目标迭代状态。
 * @return 状态保持不变或符合既定生命周期时返回 true。
 */
export function canTransitionSprintStatus(
  currentStatus: SprintStatus,
  targetStatus: SprintStatus,
): boolean {
  if (currentStatus === targetStatus) return true;
  return (
    (currentStatus === "planned" && targetStatus === "active") ||
    (currentStatus === "active" && targetStatus === "completed") ||
    (currentStatus === "completed" && targetStatus === "active")
  );
}

/**
 * 判断所选任务中是否存在已归属其他迭代的任务。
 *
 * @param sprintIds 所选任务当前关联的迭代 ID 列表。
 * @param currentSprintId 当前正在规划的迭代 ID。
 * @return 存在其他迭代任务时返回 true。
 */
export function hasTasksFromOtherSprint(
  sprintIds: Array<string | null>,
  currentSprintId: string,
): boolean {
  return sprintIds.some((sprintId) => Boolean(sprintId && sprintId !== currentSprintId));
}

/**
 * 为项目迭代生命周期生成顺序稳定的事务级锁查询。
 *
 * @param projectIds 需要串行保护的项目 ID 列表。
 * @return 去重并按 ID 排序后的 PostgreSQL 事务级锁查询。
 */
export function projectLifecycleLockQueries(projectIds: string[]): SQL[] {
  return [...new Set(projectIds)]
    .filter(Boolean)
    .sort()
    .map((projectId) =>
      sql`select pg_advisory_xact_lock(hashtext(${`project-lifecycle:${projectId}`}))`,
    );
}
