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
  canApproveTaskCompletion,
  canEditTask,
  canManageProject,
  getProjectAccess,
} from "@/lib/authorization";
import { apiError, textValue } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { defaultWorkspaceSettings, getWorkspaceSettings } from "@/lib/settings";
import {
  isCompletedSprintStatus,
  projectLifecycleLockQueries,
} from "@/lib/sprints";
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
  const [existingRecord] = await db
    .select({ task: tasks, sprintStatus: sprints.status })
    .from(tasks)
    .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
    .where(eq(tasks.id, id))
    .limit(1);
  if (!existingRecord) return apiError("任务不存在。", 404);
  const existing = existingRecord.task;
  const existingAccess = await getProjectAccess(currentUser, existing.projectId);
  if (!existingAccess) return apiError("任务不存在。", 404);
  if (!canEditTask(currentUser, existingAccess, existing)) {
    return apiError("无权编辑该任务。", 403);
  }
  if (isCompletedSprintStatus(existingRecord.sprintStatus)) {
    return apiError("已完成迭代为历史快照，请先重新打开后再修改任务。", 409);
  }
  const managesExistingProject = canManageProject(currentUser, existingAccess);
  if (currentUser.role === "tester" && !managesExistingProject) {
    const unsupportedFields = Object.keys(body).filter((field) => field !== "status");
    if (unsupportedFields.length > 0) {
      return apiError("测试人员只能更新自己负责验收任务的状态。", 403);
    }
  }

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
  if (assigneeId !== existing.assigneeId && !canManageProject(currentUser, targetAccess)) {
    return apiError("只有项目负责人可以调整任务负责人。", 403);
  }
  const testerId =
    "testerId" in body
      ? typeof body.testerId === "string" && body.testerId
        ? body.testerId
        : null
      : existing.testerId;
  if (testerId !== existing.testerId && !canManageProject(currentUser, targetAccess)) {
    return apiError("只有项目负责人可以调整测试负责人。", 403);
  }
  const sprintId =
    "sprintId" in body
      ? typeof body.sprintId === "string" && body.sprintId
        ? body.sprintId
        : null
      : requestedProjectId === existing.projectId
        ? existing.sprintId
        : null;
  if (sprintId !== existing.sprintId && !canManageProject(currentUser, targetAccess)) {
    return apiError("只有项目负责人可以调整任务迭代。", 403);
  }

  const status = isTaskStatus(body.status) ? body.status : existing.status;
  if (
    existing.status === "done" &&
    status === "done" &&
    testerId !== existing.testerId
  ) {
    return apiError("已完成任务需先重新打开，才能调整测试负责人。", 409);
  }
  if (status === "done" && existing.status !== "done" && testerId) {
    if (existing.status !== "review") {
      return apiError("已指派测试负责人的任务必须先进入待评审。", 409);
    }
    if (
      !canApproveTaskCompletion(currentUser, targetAccess, {
        assigneeId,
        testerId,
        reporterId: existing.reporterId,
      })
    ) {
      return apiError("该任务应由指派的测试负责人验收完成。", 403);
    }
  }

  if (
    assigneeId &&
    (status !== "done" ||
      assigneeId !== existing.assigneeId ||
      requestedProjectId !== existing.projectId)
  ) {
    const [assignee] = await db
      .select({ id: users.id })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(
        and(
          eq(projectMembers.projectId, requestedProjectId),
          eq(projectMembers.userId, assigneeId),
          eq(users.status, "active"),
          sql`${projectMembers.role} in ('manager', 'member')`,
          sql`${users.role} not in ('tester', 'viewer')`,
        ),
      )
      .limit(1);
    if (!assignee) return apiError("任务负责人必须是该项目的有效成员。");
  }
  if (
    testerId &&
    (status !== "done" ||
      testerId !== existing.testerId ||
      requestedProjectId !== existing.projectId)
  ) {
    const [tester] = await db
      .select({ id: users.id })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(
        and(
          eq(projectMembers.projectId, requestedProjectId),
          eq(projectMembers.userId, testerId),
          eq(projectMembers.role, "tester"),
          eq(users.role, "tester"),
          eq(users.status, "active"),
        ),
      )
      .limit(1);
    if (!tester) return apiError("测试负责人必须是该项目的有效测试人员。");
  }
  if (sprintId) {
    const [sprint] = await db
      .select({ id: sprints.id, status: sprints.status })
      .from(sprints)
      .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, requestedProjectId)))
      .limit(1);
    if (!sprint) return apiError("迭代不存在或不属于所选项目。");
    if (isCompletedSprintStatus(sprint.status)) {
      return apiError("已完成迭代为历史快照，请先重新打开后再加入任务。", 409);
    }
  }

  const title = "title" in body ? textValue(body.title, 160) : existing.title;
  if (!title) return apiError("任务标题不能为空。");
  const dueDate = "dueDate" in body ? parseDate(body.dueDate) : existing.dueDate;
  if (dueDate === undefined) return apiError("截止日期格式无效。");
  const estimateHours =
    "estimateHours" in body ? safeHours(body.estimateHours) : existing.estimateHours;
  const settings = (await getWorkspaceSettings()) ?? defaultWorkspaceSettings;
  if (settings.requireEstimate && estimateHours <= 0) {
    return apiError("当前工作空间要求任务填写预估工时。");
  }

  try {
    const updated = await db.transaction(async (tx) => {
      for (const lockQuery of projectLifecycleLockQueries([
        existing.projectId,
        requestedProjectId,
      ])) {
        await tx.execute(lockQuery);
      }
      const [lockedTask] = await tx
        .select({
          updatedAt: tasks.updatedAt,
          sprintStatus: sprints.status,
        })
        .from(tasks)
        .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
        .where(eq(tasks.id, id))
        .limit(1);
      if (!lockedTask || lockedTask.updatedAt.getTime() !== existing.updatedAt.getTime()) {
        throw new Error("TASK_CHANGED");
      }
      if (isCompletedSprintStatus(lockedTask.sprintStatus)) {
        throw new Error("COMPLETED_SPRINT");
      }
      if (sprintId) {
        const [lockedSprint] = await tx
          .select({ status: sprints.status })
          .from(sprints)
          .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, requestedProjectId)))
          .limit(1);
        if (!lockedSprint || isCompletedSprintStatus(lockedSprint.status)) {
          throw new Error("COMPLETED_SPRINT");
        }
      }

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
          testerId,
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
  } catch (error) {
    if (error instanceof Error && error.message === "COMPLETED_SPRINT") {
      return apiError("已完成迭代为历史快照，请先重新打开后再修改任务。", 409);
    }
    if (error instanceof Error && error.message === "TASK_CHANGED") {
      return apiError("任务已被其他操作更新，请刷新后重试。", 409);
    }
    throw error;
  }
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
  const [existingRecord] = await db
    .select({ task: tasks, sprintStatus: sprints.status })
    .from(tasks)
    .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
    .where(eq(tasks.id, id))
    .limit(1);
  if (!existingRecord) return apiError("任务不存在。", 404);
  const existing = existingRecord.task;
  const access = await getProjectAccess(currentUser, existing.projectId);
  if (!access || access.archived) return apiError("任务不存在。", 404);
  if (!canManageProject(currentUser, access) && existing.reporterId !== currentUser.id) {
    return apiError("只能删除自己创建的任务。", 403);
  }
  if (isCompletedSprintStatus(existingRecord.sprintStatus)) {
    return apiError("已完成迭代为历史快照，请先重新打开后再删除任务。", 409);
  }

  try {
    await db.transaction(async (tx) => {
      for (const lockQuery of projectLifecycleLockQueries([existing.projectId])) {
        await tx.execute(lockQuery);
      }
      const [lockedTask] = await tx
        .select({
          updatedAt: tasks.updatedAt,
          sprintStatus: sprints.status,
        })
        .from(tasks)
        .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
        .where(eq(tasks.id, id))
        .limit(1);
      if (!lockedTask || lockedTask.updatedAt.getTime() !== existing.updatedAt.getTime()) {
        throw new Error("TASK_CHANGED");
      }
      if (isCompletedSprintStatus(lockedTask.sprintStatus)) {
        throw new Error("COMPLETED_SPRINT");
      }
      const [logCount] = await tx
        .select({ value: count() })
        .from(workLogs)
        .where(eq(workLogs.taskId, id));
      if (Number(logCount?.value ?? 0) > 0) {
        throw new Error("TASK_HAS_WORK_LOGS");
      }
      const [deleted] = await tx.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
      if (!deleted) throw new Error("TASK_CHANGED");
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "task.delete",
        entityType: "task",
        entityId: id,
        metadata: { title: existing.title, projectId: existing.projectId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "COMPLETED_SPRINT") {
      return apiError("已完成迭代为历史快照，请先重新打开后再删除任务。", 409);
    }
    if (error instanceof Error && error.message === "TASK_HAS_WORK_LOGS") {
      return apiError("该任务已有工时记录，为保留历史数据不能删除。", 409);
    }
    if (error instanceof Error && error.message === "TASK_CHANGED") {
      return apiError("任务已被其他操作更新，请刷新后重试。", 409);
    }
    throw error;
  }
}
