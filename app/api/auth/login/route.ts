import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { apiError, normalizeEmail } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { verifyPassword } from "@/lib/password";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
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

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const passwordMatches =
    user?.passwordHash &&
    (await verifyPassword(password, user.passwordHash));

  if (!user || !passwordMatches) {
    return apiError("邮箱或密码不正确。", 401);
  }

  if (user.status !== "active") {
    return apiError(
      user.status === "disabled"
        ? "该账号已停用，请联系管理员。"
        : "该账号尚未激活，请先完成邀请。",
      403,
    );
  }

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const session = await createSession({
    userId: user.id,
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? null,
    userAgent: requestHeaders.get("user-agent"),
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
