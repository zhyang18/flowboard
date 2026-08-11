"use client";

import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import type { ClientAttachment } from "./attachment-editor";

type AttachmentViewerProps = {
  owner: { type: "projectId" | "taskId" | "rejectionId"; id: string };
};

/**
 * 只读展示指定业务实体的附件下载列表。
 *
 * @param owner 附件业务归属。
 * @return 附件下载列表组件。
 */
export default function AttachmentViewer({ owner }: AttachmentViewerProps) {
  const [attachments, setAttachments] = useState<ClientAttachment[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/attachments?${owner.type}=${encodeURIComponent(owner.id)}`,
          { cache: "no-store" },
        );
        const result = (await response.json()) as { data?: ClientAttachment[] };
        if (response.ok) setAttachments(result.data ?? []);
      } catch {
        setAttachments([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [owner.id, owner.type]);

  if (!attachments.length) return null;
  return (
    <div className="attachment-viewer">
      {attachments.map((attachment) => (
        <a href={`${attachment.contentUrl}?download=1`} download key={attachment.id}>
          <Paperclip size={12} /> {attachment.fileName}
        </a>
      ))}
    </div>
  );
}
