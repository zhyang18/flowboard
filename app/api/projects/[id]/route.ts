import { and, eq, inArray, isNotNull, ne, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  auditLogs,
  projectMembers,
  projects,
  tasks,
  users,
} from "@/db/schema";
import { canManageProject, getProjectAccess } from "@/lib/authorization";
import { apiError, isUniqueViolation, textValue } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { canOwnProject, projectMemberRoleForUser } from "@/lib/users";
import {
  isProjectStatus,
  parseDate,
  projectCode,
  serializeProject,
} from "@/lib/workspace";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 解析并去重项目成员 ID。
 *
 * @param value 客户端提交的成员 ID 列表。
 * @param ownerId 项目负责人 ID。
 * @return 包含负责人的去重成员 ID 列表。
 */
function parseMemberIds(value: unknown, ownerId: string): string[] {
  const values = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item))
    : [];
  return [...new Set([ownerId, ...values])].slice(0, 200);
}

/**
 * 更新项目资料和项目成员关系。
 *
 * @param request 当前更新请求。
 * @param context 包含项目 ID 的路由上下文。
 * @return 更新后的项目记录。
 */
export async function PATCH(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  const access = await getProjectAccess(currentUser, id);
  if (!access || access.archived) return apiError("项目不存在。", 404);
  if (!canManageProject(currentUser, access)) return apiError("无权编辑项目。", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }

  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!existing || existing.archived) return apiError("项目不存在。", 404);

  const startDate = "startDate" in body ? parseDate(body.startDate) : existing.startDate;
  const dueDate = "dueDate" in body ? parseDate(body.dueDate) : existing.dueDate;
  if (startDate === undefined || dueDate === undefined) {
    return apiError("项目日期格式无效。");
  }
  if (startDate && dueDate && dueDate < startDate) {
    return apiError("截止日期不能早于开始日期。");
  }

  const ownerId =
    typeof body.ownerId === "string" && body.ownerId ? body.ownerId : existing.ownerId;
  const existingMemberRows = await db
    .select({ id: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, id));
  const memberIds =
    "memberIds" in body || ownerId !== existing.ownerId
      ? parseMemberIds(
          "memberIds" in body ? body.memberIds : existingMemberRows.map((member) => member.id),
          ownerId,
        )
      : existingMemberRows.map((member) => member.id);
  const activeMembers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(inArray(users.id, memberIds), eq(users.status, "active")));
  if (activeMembers.length !== memberIds.length) {
    return apiError("项目成员中包含不存在或已停用的账号。");
  }
  const developerIds = activeMembers
    .filter((member) => member.role !== "viewer" && member.role !== "tester")
    .map((member) => member.id);
  const testerIds = activeMembers
    .filter((member) => member.role === "tester")
    .map((member) => member.id);
  const owner = activeMembers.find((member) => member.id === ownerId);
  if (!owner || !canOwnProject(owner.role)) {
    return apiError("项目负责人必须是正常状态的管理员或研发成员。");
  }

  const name = "name" in body ? textValue(body.name, 80) : existing.name;
  const code = "code" in body ? projectCode(body.code) : existing.code;
  if (!name || !code) return apiError("项目名称和代号不能为空。");

  try {
    const updated = await db.transaction(async (tx) => {
      const [project] = await tx
        .update(projects)
        .set({
          name,
          code,
          description:
            "description" in body ? textValue(body.description, 500) : existing.description,
          color:
            "color" in body && /^#[0-9a-f]{6}$/i.test(String(body.color))
              ? String(body.color)
              : existing.color,
          status: isProjectStatus(body.status) ? body.status : existing.status,
          ownerId,
          startDate,
          dueDate,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();

      await tx
        .update(tasks)
        .set({ assigneeId: null, updatedAt: new Date() })
        .where(
          and(
            eq(tasks.projectId, id),
            ne(tasks.status, "done"),
            isNotNull(tasks.assigneeId),
            developerIds.length
              ? notInArray(tasks.assigneeId, developerIds)
              : isNotNull(tasks.assigneeId),
          ),
        );
      await tx
        .update(tasks)
        .set({ testerId: null, updatedAt: new Date() })
        .where(
          and(
            eq(tasks.projectId, id),
            ne(tasks.status, "done"),
            isNotNull(tasks.testerId),
            testerIds.length
              ? notInArray(tasks.testerId, testerIds)
              : isNotNull(tasks.testerId),
          ),
        );
      await tx.delete(projectMembers).where(eq(projectMembers.projectId, id));
      await tx.insert(projectMembers).values(
        activeMembers.map((member) => ({
          projectId: id,
          userId: member.id,
          role: projectMemberRoleForUser(member.role, member.id === ownerId),
          updatedAt: new Date(),
        })),
      );
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "project.update",
        entityType: "project",
        entityId: id,
        metadata: { changedFields: Object.keys(body), memberIds },
      });
      return project;
    });

    return NextResponse.json({ data: serializeProject(updated) });
  } catch (error) {
    if (isUniqueViolation(error)) return apiError("项目代号已存在。", 409);
    throw error;
  }
}

/**
 * 归档项目并保留任务、迭代和工时历史。
 *
 * @param request 当前归档请求。
 * @param context 包含项目 ID 的路由上下文。
 * @return 归档成功标记。
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  const access = await getProjectAccess(currentUser, id);
  if (!access || access.archived) return apiError("项目不存在。", 404);
  if (!canManageProject(currentUser, access)) return apiError("无权归档项目。", 403);

  const db = getDb();
  await db.transaction(async (tx) => {
    const [archived] = await tx
      .update(projects)
      .set({ archived: true, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.archived, false)))
      .returning({ id: projects.id, name: projects.name });
    if (!archived) throw new Error("PROJECT_NOT_FOUND");
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "project.archive",
      entityType: "project",
      entityId: id,
      metadata: { name: archived.name },
    });
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") return;
    throw error;
  });

  return NextResponse.json({ success: true });
}
