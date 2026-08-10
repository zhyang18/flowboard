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
