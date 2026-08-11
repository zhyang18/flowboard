import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { attachments, taskRejections, tasks } from "@/db/schema";
import { getProjectAccess } from "@/lib/authorization";
import {
  attachmentDraftToken,
  MAX_ATTACHMENT_BYTES,
  safeAttachmentName,
  serializeAttachment,
} from "@/lib/attachments";
import { apiError } from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 获取当前用户可见实体的附件列表或自己的草稿附件。
 *
 * @param request 当前附件查询请求。
 * @return 不包含二进制正文的附件列表。
 */
export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const taskId = searchParams.get("taskId");
  const rejectionId = searchParams.get("rejectionId");
  const draftToken = attachmentDraftToken(searchParams.get("draftToken"));
  const ownerCount = [projectId, taskId, rejectionId, draftToken].filter(Boolean).length;
  if (ownerCount !== 1) return apiError("请指定唯一的附件归属。");

  const db = getDb();
  if (projectId) {
    if (!(await getProjectAccess(currentUser, projectId))) return apiError("项目不存在。", 404);
  } else if (taskId) {
    const [task] = await db
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task || !(await getProjectAccess(currentUser, task.projectId))) {
      return apiError("任务不存在。", 404);
    }
  } else if (rejectionId) {
    const [rejection] = await db
      .select({ projectId: tasks.projectId })
      .from(taskRejections)
      .innerJoin(tasks, eq(taskRejections.taskId, tasks.id))
      .where(eq(taskRejections.id, rejectionId))
      .limit(1);
    if (!rejection || !(await getProjectAccess(currentUser, rejection.projectId))) {
      return apiError("测试记录不存在。", 404);
    }
  }

  const rows = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(
      projectId
        ? eq(attachments.projectId, projectId)
        : taskId
          ? eq(attachments.taskId, taskId)
          : rejectionId
            ? eq(attachments.rejectionId, rejectionId)
            : and(
                eq(attachments.draftToken, draftToken!),
                eq(attachments.uploadedBy, currentUser.id),
              ),
    )
    .orderBy(asc(attachments.createdAt));

  return NextResponse.json({ data: rows.map(serializeAttachment) });
}

/**
 * 上传一项草稿附件，保存业务实体时再原子认领。
 *
 * @param request 包含文件和草稿令牌的 multipart 请求。
 * @return 新建附件的客户端结构。
 */
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError("附件请求格式无效。");
  }
  const file = formData.get("file");
  const draftToken = attachmentDraftToken(formData.get("draftToken"));
  if (!(file instanceof File) || !draftToken) return apiError("请选择文件并提供草稿令牌。");
  if (file.size <= 0) return apiError("不能上传空文件。");
  if (file.size > MAX_ATTACHMENT_BYTES) return apiError("单个附件不能超过 4 MB。", 413);

  const [attachment] = await getDb()
    .insert(attachments)
    .values({
      fileName: safeAttachmentName(file.name),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      content: Buffer.from(await file.arrayBuffer()),
      draftToken,
      uploadedBy: currentUser.id,
    })
    .returning({
      id: attachments.id,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
    });
  return NextResponse.json({ data: serializeAttachment(attachment) }, { status: 201 });
}
