import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { roleDefinitions, sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "flowboard_session";

/**
 * 对原始会话令牌执行单向散列。
 *
 * @param token 原始会话令牌。
 * @return SHA-256 十六进制摘要。
 */
export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 生成安全的会话 Cookie 选项。
 *
 * @param expiresAt 可选的持久化到期时间。
 * @return Next.js Cookie 写入选项。
 */
export function sessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

/**
 * 创建随机服务端会话。
 *
 * @param input 用户、客户端和可选存续时间信息。
 * @return 原始令牌、散列和到期时间。
 */
export async function createSession(input: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  ttlMs?: number;
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const ttlDays = Math.min(30, Math.max(1, Number(process.env.SESSION_TTL_DAYS) || 7));
  const expiresAt = new Date(
    Date.now() + (input.ttlMs ?? ttlDays * 24 * 60 * 60 * 1000),
  );
  const db = getDb();

  await db.insert(sessions).values({
    tokenHash,
    userId: input.userId,
    expiresAt,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent?.slice(0, 500) ?? null,
  });

  return { token, tokenHash, expiresAt };
}

/**
 * 删除当前浏览器会话并清空 Cookie。
 *
 * @return 无返回值。
 */
export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await getDb()
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(token)));
  }

  cookieStore.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
}

/**
 * 根据会话 Cookie 获取当前正常状态用户。
 *
 * @return 有效会话对应的用户，否则返回 null。
 */
export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const [record] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      roleDefinitionId: users.roleDefinitionId,
      roleName: roleDefinitions.name,
      permissions: roleDefinitions.permissions,
      status: users.status,
      department: users.department,
      team: users.team,
      sessionExpiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roleDefinitions, eq(users.roleDefinitionId, roleDefinitions.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  return record ?? null;
}

export type CurrentUser = NonNullable<
  Awaited<ReturnType<typeof getCurrentUser>>
>;
