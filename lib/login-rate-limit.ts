import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { loginRateLimits } from "@/db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

/**
 * 查询登录键当前是否被限流，并清理已过期的统计窗口。
 *
 * @param key 已散列的登录限流键。
 * @return 未被限流时返回 0，否则返回建议等待秒数。
 */
export async function getLoginRetryAfter(key: string): Promise<number> {
  const db = getDb();
  const now = new Date();
  await db
    .delete(loginRateLimits)
    .where(
      and(
        eq(loginRateLimits.key, key),
        lt(loginRateLimits.windowStartedAt, new Date(now.getTime() - WINDOW_MS)),
      ),
    );

  const [record] = await db
    .select({ blockedUntil: loginRateLimits.blockedUntil })
    .from(loginRateLimits)
    .where(eq(loginRateLimits.key, key))
    .limit(1);
  if (!record?.blockedUntil || record.blockedUntil <= now) return 0;
  return Math.max(1, Math.ceil((record.blockedUntil.getTime() - now.getTime()) / 1000));
}

/**
 * 记录一次登录失败，并在达到阈值后启动封禁窗口。
 *
 * @param key 已散列的登录限流键。
 * @return 达到限流阈值时返回建议等待秒数，否则返回 0。
 */
export async function recordLoginFailure(key: string): Promise<number> {
  const db = getDb();
  const now = new Date();
  const blockedUntil = new Date(now.getTime() + BLOCK_MS);
  const [record] = await db
    .insert(loginRateLimits)
    .values({
      key,
      failures: 1,
      windowStartedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: loginRateLimits.key,
      set: {
        failures: sql`${loginRateLimits.failures} + 1`,
        blockedUntil: sql`case
          when ${loginRateLimits.failures} + 1 >= ${MAX_FAILURES}
            then ${sql.param(blockedUntil, loginRateLimits.blockedUntil)}
          else ${loginRateLimits.blockedUntil}
        end`,
        updatedAt: now,
      },
    })
    .returning({
      failures: loginRateLimits.failures,
      blockedUntil: loginRateLimits.blockedUntil,
    });

  if (record.failures < MAX_FAILURES || !record.blockedUntil) return 0;
  return Math.max(1, Math.ceil((record.blockedUntil.getTime() - now.getTime()) / 1000));
}

/**
 * 登录成功后清除对应的失败统计。
 *
 * @param key 已散列的登录限流键。
 * @return 无返回值。
 */
export async function clearLoginFailures(key: string): Promise<void> {
  await getDb().delete(loginRateLimits).where(eq(loginRateLimits.key, key));
}

/**
 * 清理已经结束封禁且窗口过期的限流记录。
 *
 * @return 无返回值。
 */
export async function cleanupExpiredLoginLimits(): Promise<void> {
  await getDb()
    .delete(loginRateLimits)
    .where(lt(loginRateLimits.windowStartedAt, new Date(Date.now() - WINDOW_MS)));
}
