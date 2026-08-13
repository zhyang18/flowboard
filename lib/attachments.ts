import type { Attachment } from "@/db/schema";

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENT_NAME_LENGTH = 180;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMBEDDABLE_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * 校验并返回附件草稿令牌。
 *
 * @param value 客户端提交的草稿令牌。
 * @return 有效 UUID 字符串，无效时返回 null。
 */
export function attachmentDraftToken(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

/**
 * 清理上传文件名中的路径字符并限制长度。
 *
 * @param value 浏览器提交的原始文件名。
 * @return 可安全显示和下载的文件名。
 */
export function safeAttachmentName(value: string): string {
  const normalized = value.replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
  return normalized.slice(0, MAX_ATTACHMENT_NAME_LENGTH) || "attachment";
}

/**
 * 判断附件是否允许嵌入图文说明中显示。
 *
 * @param mimeType 附件 MIME 类型。
 * @return 支持安全内嵌显示的图片类型返回 true。
 */
export function isEmbeddableImage(mimeType: string): boolean {
  return EMBEDDABLE_IMAGE_TYPES.has(mimeType.toLowerCase());
}

/**
 * 将附件数据库记录转换为客户端可用结构。
 *
 * @param attachment 附件数据库记录。
 * @return 不包含二进制正文的附件响应结构。
 */
export function serializeAttachment(
  attachment: Pick<
    Attachment,
    "id" | "fileName" | "mimeType" | "sizeBytes" | "createdAt"
  >,
) {
  return {
    ...attachment,
    contentUrl: `/api/attachments/${attachment.id}/content`,
    embeddable: isEmbeddableImage(attachment.mimeType),
    createdAt: attachment.createdAt.toISOString(),
  };
}
