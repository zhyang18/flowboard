import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments, taskRejections, tasks } from "@/db/schema";
import { canEditTask, canManageProject, getProjectAccess } from "@/lib/authorization";
import { apiError } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 删除自己上传或由当前用户管理实体中的附件。
 *
 * @param request 当前附件删除请求。
 * @param context 包含附件 ID 的路由上下文。
 * @return 删除成功标记。
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  const { id } = await context.params;
  const db = getDb();
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!attachment) return apiError("附件不存在。", 404);

  let projectId = attachment.projectId;
  let editableTask: typeof tasks.$inferSelect | null = null;
  if (attachment.taskId) {
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, attachment.taskId))
      .limit(1);
    projectId = task?.projectId ?? null;
    editableTask = task ?? null;
  } else if (attachment.rejectionId) {
    const [rejection] = await db
      .select({ projectId: tasks.projectId })
      .from(taskRejections)
      .innerJoin(tasks, eq(taskRejections.taskId, tasks.id))
      .where(eq(taskRejections.id, attachment.rejectionId))
      .limit(1);
    projectId = rejection?.projectId ?? null;
  }
  const access = projectId ? await getProjectAccess(currentUser, projectId) : null;
  const canDelete = attachment.draftToken
    ? attachment.uploadedBy === currentUser.id
    : canManageProject(currentUser, access) ||
      Boolean(editableTask && canEditTask(currentUser, access, editableTask));
  if (!canDelete) return apiError("无权删除该附件。", 403);

  await db.delete(attachments).where(eq(attachments.id, id));
  return Response.json({ success: true });
}
