import {
  and,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import {
  apiError,
  canManageUsers,
  isUniqueViolation,
} from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { getCurrentUser } from "@/lib/session";
import {
  isUserStatus,
  parseUserInput,
  serializeUser,
  type UserInput,
} from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权查看用户列表。", 403);

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim().slice(0, 80) ?? "";
  const department = searchParams.get("department")?.trim().slice(0, 60) ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize")) || 20),
  );
  const conditions: SQL[] = [];

  if (query) {
    const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(
      or(
        ilike(users.name, pattern),
        ilike(users.email, pattern),
        ilike(users.team, pattern),
      )!,
    );
  }

  if (department) conditions.push(eq(users.department, department));
  if (isUserStatus(status)) conditions.push(eq(users.status, status));

  const where = conditions.length ? and(...conditions) : undefined;
  const db = getDb();
  const [records, totalResult, statsResult, departmentRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        department: users.department,
        team: users.team,
        role: users.role,
        status: users.status,
        projectCount: users.projectCount,
        capacity: users.capacity,
        lastSeenAt: users.lastSeenAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(users).where(where),
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
        invited: sql<number>`count(*) filter (where ${users.status} = 'invited')::int`,
        admins: sql<number>`count(*) filter (where ${users.role} in ('super_admin', 'project_admin'))::int`,
      })
      .from(users),
    db
      .selectDistinct({ department: users.department })
      .from(users)
      .orderBy(users.department),
  ]);

  return NextResponse.json({
    data: records.map(serializeUser),
    pagination: {
      page,
      pageSize,
      total: totalResult[0]?.value ?? 0,
    },
    stats: statsResult[0] ?? {
      total: 0,
      active: 0,
      invited: 0,
      admins: 0,
    },
    departments: departmentRows.map((item) => item.department),
  });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) return apiError("请先登录。", 401);
  if (!canManageUsers(currentUser)) return apiError("无权创建用户。", 403);

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const parsed = parseUserInput(body);
  if (!parsed.data || parsed.error) return apiError(parsed.error ?? "用户数据无效。");

  const data = parsed.data as UserInput;

  if (currentUser.role !== "super_admin" && data.role === "super_admin") {
    return apiError("只有超级管理员可以授予超级管理员角色。", 403);
  }

  if (data.status === "active" && !data.password) {
    return apiError("正常状态的账号需要设置初始密码。");
  }

  try {
    const db = getDb();
    const [created] = await db
      .insert(users)
      .values({
        name: data.name,
        email: data.email,
        phone: data.phone,
        department: data.department,
        team: data.team,
        role: data.role,
        status: data.status,
        passwordHash: data.password
          ? await hashPassword(data.password)
          : null,
        projectCount: data.projectCount,
        capacity: data.capacity,
      })
      .returning();

    await db.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "user.create",
      entityType: "user",
      entityId: created.id,
      metadata: {
        email: created.email,
        role: created.role,
        status: created.status,
      },
    });

    return NextResponse.json({ data: serializeUser(created) }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return apiError("该邮箱已被使用。", 409);
    throw error;
  }
}
