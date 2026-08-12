export const NEON_FREE_STORAGE_LIMIT_BYTES = 500_000_000;

const storageUnits = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * 将数据库字节数格式化为易读的十进制存储容量。
 *
 * @param bytes 需要格式化的非负字节数。
 * @return 带有 B、KB、MB、GB 或 TB 单位的容量文本。
 */
export function formatStorageBytes(bytes: number): string {
  const safeBytes = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  let unitIndex = 0;
  let divisor = 1;

  while (safeBytes >= divisor * 1000 && unitIndex < storageUnits.length - 1) {
    divisor *= 1000;
    unitIndex += 1;
  }

  const value = safeBytes / divisor;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value)} ${storageUnits[unitIndex]}`;
}

/**
 * 按套餐容量上限计算数据库剩余可用容量。
 *
 * @param usedBytes 当前数据库已使用的字节数。
 * @param limitBytes 套餐允许使用的总字节数。
 * @return 不小于零的剩余字节数。
 */
export function remainingStorageBytes(
  usedBytes: number,
  limitBytes: number = NEON_FREE_STORAGE_LIMIT_BYTES,
): number {
  return Math.max(0, limitBytes - Math.max(0, usedBytes));
}
