import { and, count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  auditLogs,
  projectMembers,
  sprints,
  tasks,
  users,
  workLogs,
} from "@/db/schema";
import {
  canEditTask,
  canManageProject,
  getProjectAccess,
} from "@/lib/authorization";
import { apiError, textValue } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";
import {
  isTaskPriority,
  isTaskStatus,
  parseDate,
  safeHours,
  serializeTask,
} from "@/lib/workspace";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 更新任务并限制普通成员只能维护自己负责或创建的任务。
 *
 * @param request 当前更新请求。
 * @param context 包含任务 ID 的路由上下文。
 * @return 更新后的任务记录。
 */
export async function PATCH(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  if ("actualHours" in body) {
    return apiError("实际工时由工时明细自动汇总，不能直接修改。");
  }

  const db = getDb();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!existing) return apiError("任务不存在。", 404);
  const existingAccess = await getProjectAccess(currentUser, existing.projectId);
  if (!existingAccess) return apiError("任务不存在。", 404);
  if (!canEditTask(currentUser, existingAccess, existing)) {
    return apiError("无权编辑该任务。", 403);
  }
  const managesExistingProject = canManageProject(currentUser, existingAccess);

  const requestedProjectId =
    typeof body.projectId === "string" && body.projectId ? body.projectId : existing.projectId;
  if (requestedProjectId !== existing.projectId && !managesExistingProject) {
    return apiError("只有项目负责人可以移动任务到其他项目。", 403);
  }
  if (requestedProjectId !== existing.projectId) {
    const [logCount] = await db
      .select({ value: count() })
      .from(workLogs)
      .where(eq(workLogs.taskId, id));
    if (Number(logCount?.value ?? 0) > 0) {
      return apiError("该任务已有工时历史，不能移动到其他项目。", 409);
    }
  }
  const targetAccess =
    requestedProjectId === existing.projectId
      ? existingAccess
      : await getProjectAccess(currentUser, requestedProjectId);
  if (!targetAccess || targetAccess.archived) return apiError("所属项目不存在。", 404);
  if (requestedProjectId !== existing.projectId && !canManageProject(currentUser, targetAccess)) {
    return apiError("无权将任务移动到目标项目。", 403);
  }

  const assigneeId =
    "assigneeId" in body
      ? typeof body.assigneeId === "string" && body.assigneeId
        ? body.assigneeId
        : null
      : existing.assigneeId;
  if ("assigneeId" in body && !canManageProject(currentUser, targetAccess)) {
    return apiError("只有项目负责人可以调整任务负责人。", 403);
  }
  const sprintId =
    "sprintId" in body
      ? typeof body.sprintId === "string" && body.sprintId
        ? body.sprintId
        : null
      : requestedProjectId === existing.projectId
        ? existing.sprintId
        : null;
  if ("sprintId" in body && !canManageProject(currentUser, targetAccess)) {
    return apiError("只有项目负责人可以调整任务迭代。", 403);
  }

  if (assigneeId) {
    const [assignee] = await db
      .select({ id: users.id })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(
        and(
          eq(projectMembers.projectId, requestedProjectId),
          eq(projectMembers.userId, assigneeId),
          eq(users.status, "active"),
          sql`${projectMembers.role} <> 'viewer'`,
        ),
      )
      .limit(1);
    if (!assignee) return apiError("任务负责人必须是该项目的有效成员。");
  }
  if (sprintId) {
    const [sprint] = await db
      .select({ id: sprints.id })
      .from(sprints)
      .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, requestedProjectId)))
      .limit(1);
    if (!sprint) return apiError("迭代不存在或不属于所选项目。");
  }

  const title = "title" in body ? textValue(body.title, 160) : existing.title;
  if (!title) return apiError("任务标题不能为空。");
  const dueDate = "dueDate" in body ? parseDate(body.dueDate) : existing.dueDate;
  if (dueDate === undefined) return apiError("截止日期格式无效。");
  const status = isTaskStatus(body.status) ? body.status : existing.status;
  const estimateHours =
    "estimateHours" in body ? safeHours(body.estimateHours) : existing.estimateHours;
  const settings = (await getWorkspaceSettings()) ?? defaultWorkspaceSettings;
  if (settings.requireEstimate && estimateHours <= 0) {
    return apiError("当前工作空间要求任务填写预估工时。");
  }

  const updated = await db.transaction(async (tx) => {
    let sortOrder = existing.sortOrder;
    if (status !== existing.status || requestedProjectId !== existing.projectId) {
      const [order] = await tx
        .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), -1) + 1` })
        .from(tasks)
        .where(and(eq(tasks.projectId, requestedProjectId), eq(tasks.status, status)));
      sortOrder = Number(order?.value ?? 0);
    } else if (Number.isInteger(body.sortOrder)) {
      sortOrder = Math.max(0, Number(body.sortOrder));
    }

    const [task] = await tx
      .update(tasks)
      .set({
        projectId: requestedProjectId,
        sprintId,
        title,
        description:
          "description" in body ? textValue(body.description, 1500) : existing.description,
        status,
        priority: isTaskPriority(body.priority) ? body.priority : existing.priority,
        assigneeId,
        estimateHours,
        sortOrder,
        dueDate,
        completedAt:
          status === "done"
            ? settings.autoCompleteTimestamp
              ? existing.completedAt ?? new Date()
              : existing.completedAt
            : null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "task.update",
      entityType: "task",
      entityId: id,
      metadata: {
        changedFields: Object.keys(body),
        fromStatus: existing.status,
        toStatus: task.status,
      },
    });
    return task;
  });

  return NextResponse.json({ data: serializeTask(updated) });
}

/**
 * 删除尚未产生工时历史的任务。
 *
 * @param request 当前删除请求。
 * @param context 包含任务 ID 的路由上下文。
 * @return 删除成功标记。
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  const db = getDb();
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!existing) return apiError("任务不存在。", 404);
  const access = await getProjectAccess(currentUser, existing.projectId);
  if (!access) return apiError("任务不存在。", 404);
  if (!canManageProject(currentUser, access) && existing.reporterId !== currentUser.id) {
    return apiError("只能删除自己创建的任务。", 403);
  }

  const [logCount] = await db
    .select({ value: count() })
    .from(workLogs)
    .where(eq(workLogs.taskId, id));
  if (Number(logCount?.value ?? 0) > 0) {
    return apiError("该任务已有工时记录，为保留历史数据不能删除。", 409);
  }

  await db.transaction(async (tx) => {
    await tx.insert(auditLogs).values({
      actorId: currentUser.id,
      action: "task.delete",
      entityType: "task",
      entityId: id,
      metadata: { title: existing.title, projectId: existing.projectId },
    });
    await tx.delete(tasks).where(eq(tasks.id, id));
  });

  return NextResponse.json({ success: true });
}
