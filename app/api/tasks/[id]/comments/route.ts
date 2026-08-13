import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  notifications,
  taskComments,
  tasks,
  users,
} from "@/db/schema";
import { getProjectAccess } from "@/lib/authorization";
import { apiError, textValue } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 获取任务的所有评论记录。
 *
 * @param request 当前获取请求。
 * @param context 包含任务 ID 的路由上下文。
 * @return 任务的评论列表。
 */
export async function GET(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { id } = await context.params;
  const db = getDb();
  
  const [taskRecord] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!taskRecord) return apiError("任务不存在。", 404);
  const access = await getProjectAccess(currentUser, taskRecord.projectId);
  if (!access) return apiError("任务不存在。", 404);

  const rows = await db
    .select({
      id: taskComments.id,
      content: taskComments.content,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
      author: {
        id: users.id,
        name: users.name,
      }
    })
    .from(taskComments)
    .innerJoin(users, eq(taskComments.authorId, users.id))
    .where(eq(taskComments.taskId, id))
    .orderBy(asc(taskComments.createdAt));

  const data = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return NextResponse.json({ data });
}

/**
 * 发表任务新评论。
 *
 * @param request 当前发表评论请求。
 * @param context 包含任务 ID 的路由上下文。
 * @return 新创建的评论记录。
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
  const content = textValue(body.content, 10_000);
  if (!content) return apiError("评论内容不能为空。");

  const db = getDb();
  const [taskRecord] = await db
    .select({
      projectId: tasks.projectId,
      title: tasks.title,
      assigneeId: tasks.assigneeId,
      testerId: tasks.testerId,
      reporterId: tasks.reporterId,
    })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  
  if (!taskRecord) return apiError("任务不存在。", 404);
  const access = await getProjectAccess(currentUser, taskRecord.projectId);
  if (!access || access.archived) return apiError("任务不存在。", 404);
  if (currentUser.role === "viewer" || access.memberRole === "viewer") {
    return apiError("访客无权发表评论。", 403);
  }

  const comment = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(taskComments)
      .values({
        taskId: id,
        authorId: currentUser.id,
        content,
      })
      .returning();

    // 通知任务相关人员
    const recipients = new Set([
      taskRecord.assigneeId,
      taskRecord.testerId,
      taskRecord.reporterId,
    ].filter(Boolean));
    recipients.delete(currentUser.id); // 排除当前发言人

    if (recipients.size > 0) {
      await tx.insert(notifications).values(
        Array.from(recipients).map((recipientId) => ({
          recipientId: recipientId as string,
          taskId: id,
          kind: "comment",
          title: taskRecord.title,
          detail: `${currentUser.name} 发表了新评论`,
          href: `/dashboard/board?taskId=${id}`,
        }))
      );
    }
    
    return created;
  });

  return NextResponse.json({
    data: {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      author: {
        id: currentUser.id,
        name: currentUser.name,
      }
    }
  });
}
