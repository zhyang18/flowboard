import { and, count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  attachments,
  auditLogs,
  notifications,
  sprints,
  taskRejections,
  tasks,
} from "@/db/schema";
import { getProjectAccess } from "@/lib/authorization";
import { attachmentDraftToken } from "@/lib/attachments";
import { apiError, textValue } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import { isCompletedSprintStatus, projectLifecycleLockQueries } from "@/lib/sprints";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 记录测试不通过原因，将任务退回开发中并通知开发负责人。
 *
 * @param request 当前测试打回请求。
 * @param context 包含任务 ID 的路由上下文。
 * @return 新建测试打回记录和任务状态。
 */
export async function POST(request: Request, context: RouteContext) {
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
  let reason = textValue(body.reason, 10_000);
  const draftToken = attachmentDraftToken(body.attachmentDraftToken);

  const db = getDb();
  if (!reason) {
    const [attachmentCount] = draftToken
      ? await db
          .select({ value: count() })
          .from(attachments)
          .where(
            and(
              eq(attachments.draftToken, draftToken),
              eq(attachments.uploadedBy, currentUser.id),
            ),
          )
      : [{ value: 0 }];
    if (Number(attachmentCount?.value ?? 0) === 0) {
      return apiError("请填写测试不通过原因或上传附件。");
    }
    reason = "详见附件。";
  }
  const [record] = await db
    .select({ task: tasks, sprintStatus: sprints.status })
    .from(tasks)
    .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
    .where(eq(tasks.id, id))
    .limit(1);
  if (!record) return apiError("任务不存在。", 404);
  const access = await getProjectAccess(currentUser, record.task.projectId);
  if (!access || access.archived) return apiError("任务不存在。", 404);
  if (currentUser.role !== "tester" || record.task.testerId !== currentUser.id) {
    return apiError("只有该任务指定的测试负责人可以提交测试不通过。", 403);
  }
  if (record.task.status !== "review") return apiError("只有待评审任务可以测试打回。", 409);
  if (isCompletedSprintStatus(record.sprintStatus)) {
    return apiError("已完成迭代为历史快照，不能打回任务。", 409);
  }

  try {
    const rejection = await db.transaction(async (tx) => {
      for (const lockQuery of projectLifecycleLockQueries([record.task.projectId])) {
        await tx.execute(lockQuery);
      }
      const [lockedTask] = await tx
        .select({ task: tasks, sprintStatus: sprints.status })
        .from(tasks)
        .leftJoin(sprints, eq(tasks.sprintId, sprints.id))
        .where(eq(tasks.id, id))
        .limit(1);
      if (
        !lockedTask ||
        lockedTask.task.updatedAt.getTime() !== record.task.updatedAt.getTime() ||
        lockedTask.task.status !== "review"
      ) {
        throw new Error("TASK_CHANGED");
      }
      if (isCompletedSprintStatus(lockedTask.sprintStatus)) throw new Error("COMPLETED_SPRINT");

      const [created] = await tx
        .insert(taskRejections)
        .values({
          taskId: id,
          testerId: currentUser.id,
          reason,
          previousStatus: "review",
          returnedStatus: "in_progress",
        })
        .returning();
      if (draftToken) {
        await tx
          .update(attachments)
          .set({ rejectionId: created.id, draftToken: null })
          .where(
            and(
              eq(attachments.draftToken, draftToken),
              eq(attachments.uploadedBy, currentUser.id),
            ),
          );
      }
      const [order] = await tx
        .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), -1) + 1` })
        .from(tasks)
        .where(and(eq(tasks.projectId, record.task.projectId), eq(tasks.status, "in_progress")));
      await tx
        .update(tasks)
        .set({
          status: "in_progress",
          sortOrder: Number(order?.value ?? 0),
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, id));

      const recipientId = record.task.assigneeId ?? record.task.reporterId;
      if (recipientId !== currentUser.id) {
        await tx.insert(notifications).values({
          recipientId,
          taskId: id,
          kind: "rejected",
          title: record.task.title,
          detail: `${currentUser.name} 测试未通过，任务已退回开发中`,
          href: `/dashboard/board?taskId=${id}`,
        });
      }
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "task.reject",
        entityType: "task",
        entityId: id,
        metadata: { rejectionId: created.id, returnedStatus: "in_progress" },
      });
      return created;
    });
    return NextResponse.json({
      data: { ...rejection, createdAt: rejection.createdAt.toISOString() },
      taskStatus: "in_progress",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_CHANGED") {
      return apiError("任务已被其他操作更新，请刷新后重试。", 409);
    }
    if (error instanceof Error && error.message === "COMPLETED_SPRINT") {
      return apiError("已完成迭代为历史快照，不能打回任务。", 409);
    }
    throw error;
  }
}
