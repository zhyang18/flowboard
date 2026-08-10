import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { apiError, normalizeEmail } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import {
  clearLoginFailures,
  getLoginRetryAfter,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import { verifyPassword } from "@/lib/password";
import {
  getRequestIp,
  hasTrustedOrigin,
  loginRateLimitKey,
} from "@/lib/request-security";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";

const DUMMY_PASSWORD_HASH =
  "scrypt$Zmxvd2JvYXJkLWR1bW15LXNhbHQ$lCQIVaFxE_ck2vRKRgLnGXlhJdPtITQ73qLE0vBGT8ay46DnYhk1vaHAOrGaf7BCzZ8LsERuakacwxd-SXLdBA";

/**
 * 构造登录频率超限响应。
 *
 * @param retryAfterSeconds 建议客户端等待秒数。
 * @return 带 Retry-After 响应头的 429 响应。
 */
function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "登录尝试过于频繁，请稍后再试。" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

/**
 * 校验账号密码并创建服务端会话。
 *
 * @param request 当前登录请求。
 * @return 登录成功时返回用户摘要，失败时返回规范化错误。
 */
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const remember = body.remember !== false;

  if (!email || !password) {
    return apiError("请输入邮箱和密码。");
  }

  const ipAddress = getRequestIp(request);
  const rateLimitKey = loginRateLimitKey(email, ipAddress);
  const existingRetryAfter = await getLoginRetryAfter(rateLimitKey);
  if (existingRetryAfter) return rateLimitResponse(existingRetryAfter);

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const passwordMatches = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    const retryAfter = await recordLoginFailure(rateLimitKey);
    if (retryAfter) return rateLimitResponse(retryAfter);
    return apiError("邮箱或密码不正确。", 401);
  }

  await clearLoginFailures(rateLimitKey);

  if (user.status !== "active") {
    return apiError(
      user.status === "disabled"
        ? "该账号已停用，请联系管理员。"
        : "该账号尚未激活，请先完成邀请。",
      403,
    );
  }

  const session = await createSession({
    userId: user.id,
    ipAddress,
    userAgent: request.headers.get("user-agent"),
    ttlMs: remember ? undefined : 12 * 60 * 60 * 1000,
  });

  await db
    .update(users)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await writeAuditLog({
    actorId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });

  (await cookies()).set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(remember ? session.expiresAt : undefined),
  );

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}
