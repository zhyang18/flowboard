"use client";

import { FileImage, Paperclip, Trash2, Upload } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { useTranslation } from "@/lib/i18n";
import RichTextContent from "./rich-text-content";

export type ClientAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentUrl: string;
  embeddable: boolean;
  createdAt: string;
};

type AttachmentOwner = {
  type: "projectId" | "taskId" | "rejectionId";
  id: string;
};

type AttachmentEditorProps = {
  draftToken: string;
  owner?: AttachmentOwner;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * 将字节数格式化为简短文件大小。
 *
 * @param sizeBytes 文件字节数。
 * @return KB 或 MB 文件大小文本。
 */
function fileSizeLabel(sizeBytes: number): string {
  return sizeBytes >= 1024 * 1024
    ? `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

/**
 * 渲染图文说明编辑、附件上传、预览和删除功能。
 *
 * @param props 组件属性。
 * @param props.draftToken 当前表单的附件草稿令牌。
 * @param props.owner 已保存业务实体的附件归属。
 * @param props.value 当前图文说明。
 * @param props.onChange 图文说明变更回调。
 * @param props.label 说明字段标题。
 * @param props.placeholder 输入框占位文本。
 * @param props.disabled 是否禁用编辑。
 * @return 附件图文编辑器组件。
 */
export default function AttachmentEditor({
  draftToken,
  owner,
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
}: AttachmentEditorProps) {
  const { t } = useTranslation();
  const [attachments, setAttachments] = useState<ClientAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const ownerType = owner?.type;
  const ownerId = owner?.id;

  const effectiveLabel = label ?? t("attachments.legend");
  const effectivePlaceholder = placeholder ?? t("attachments.placeholder");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const query = ownerType && ownerId
          ? `${ownerType}=${encodeURIComponent(ownerId)}`
          : `draftToken=${encodeURIComponent(draftToken)}`;
        const response = await fetch(`/api/attachments?${query}`, { cache: "no-store" });
        const result = (await response.json()) as { data?: ClientAttachment[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? t("attachments.loadError"));
        setAttachments(result.data ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("attachments.loadError"));
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftToken, ownerId, ownerType, t]);

  /**
   * 上传所选附件，并将安全图片标记插入说明。
   *
   * @param event 文件输入框变更事件。
   * @return 上传完成后的 Promise。
   */
  async function uploadFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setError("");
    let nextValue = value;
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("draftToken", draftToken);
        formData.set("file", file);
        const response = await fetch("/api/attachments", { method: "POST", body: formData });
        const result = (await response.json()) as { data?: ClientAttachment; error?: string };
        if (!response.ok || !result.data) throw new Error(result.error ?? t("attachments.uploadError"));
        setAttachments((current) => [...current, result.data!]);
        if (result.data.embeddable) {
          const imageMarkup = `![${result.data.fileName}](${result.data.contentUrl})`;
          nextValue = `${nextValue.trimEnd()}${nextValue.trim() ? "\n" : ""}${imageMarkup}`;
        }
      }
      if (nextValue !== value) onChange(nextValue);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("attachments.uploadError"));
    } finally {
      setUploading(false);
    }
  }

  /**
   * 删除附件并清理说明中的对应图片标记。
   *
   * @param attachment 待删除附件。
   * @return 删除完成后的 Promise。
   */
  async function deleteAttachment(attachment: ClientAttachment): Promise<void> {
    setError("");
    try {
      const response = await fetch(`/api/attachments/${attachment.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("attachments.deleteError"));
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      const markup = `![${attachment.fileName}](${attachment.contentUrl})`;
      onChange(value.replaceAll(markup, "").replace(/\n{3,}/g, "\n\n").trim());
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("attachments.deleteError"));
    }
  }

  return (
    <fieldset className="form-wide attachment-editor">
      <legend>{effectiveLabel}</legend>
      <textarea
        disabled={disabled}
        maxLength={10_000}
        rows={5}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={effectivePlaceholder}
      />
      <div className="attachment-toolbar">
        <label className={disabled || uploading ? "disabled" : ""}>
          <Upload size={14} /> {uploading ? t("attachments.uploading") : t("attachments.uploadButton")}
          <input disabled={disabled || uploading} type="file" multiple onChange={(event) => void uploadFiles(event)} />
        </label>
        <span>{t("attachments.hint")}</span>
      </div>
      {error && <div className="attachment-error">{error}</div>}
      {loading ? (
        <div className="attachment-state">{t("attachments.loading")}</div>
      ) : attachments.length ? (
        <div className="attachment-list">
          {attachments.map((attachment) => (
            <div key={attachment.id}>
              <span>{attachment.embeddable ? <FileImage size={15} /> : <Paperclip size={15} />}</span>
              <a href={`${attachment.contentUrl}?download=1`} download>{attachment.fileName}</a>
              <small>{fileSizeLabel(attachment.sizeBytes)}</small>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => void deleteAttachment(attachment)}
                  aria-label={t("attachments.deleteAria", { name: attachment.fileName })}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
      <div className="rich-text-preview">
        <small>{t("attachments.preview")}</small>
        <RichTextContent value={value} emptyText={t("attachments.noContent")} />
      </div>
    </fieldset>
  );
}
