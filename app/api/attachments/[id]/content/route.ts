import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments, taskRejections, tasks } from "@/db/schema";
import { getProjectAccess } from "@/lib/authorization";
import { apiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 读取当前用户有权查看的附件二进制内容。
 *
 * @param request 当前内容读取请求。
 * @param context 包含附件 ID 的路由上下文。
 * @return 附件二进制响应。
 */
export async function GET(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);
  const { id } = await context.params;
  const db = getDb();
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!attachment) return apiError("附件不存在。", 404);

  let projectId = attachment.projectId;
  if (attachment.taskId) {
    const [task] = await db
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.id, attachment.taskId))
      .limit(1);
    projectId = task?.projectId ?? null;
  } else if (attachment.rejectionId) {
    const [rejection] = await db
      .select({ projectId: tasks.projectId })
      .from(taskRejections)
      .innerJoin(tasks, eq(taskRejections.taskId, tasks.id))
      .where(eq(taskRejections.id, attachment.rejectionId))
      .limit(1);
    projectId = rejection?.projectId ?? null;
  }
  const canRead = attachment.draftToken
    ? attachment.uploadedBy === currentUser.id
    : Boolean(projectId && (await getProjectAccess(currentUser, projectId)));
  if (!canRead) return apiError("附件不存在。", 404);

  const download = new URL(request.url).searchParams.get("download") === "1";
  const encodedName = encodeURIComponent(attachment.fileName);
  return new Response(new Uint8Array(attachment.content), {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Type": attachment.mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
