"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Clock, MessageCircle, MessageSquare, Send } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
  };
};

/**
 * 获取名字首字母作为头像图标文字。
 *
 * @param name 作者姓名。
 * @return 名字大写首字母。
 */
function getInitial(name: string): string {
  if (!name) return "U";
  return name.trim().charAt(0).toUpperCase();
}

/**
 * 格式化相对时间或简短日期。
 *
 * @param isoString ISO 时间字符串。
 * @param locale 当前语言代码。
 * @return 友好时间显示文本。
 */
function formatTime(isoString: string, locale: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return locale === "zh" ? "刚刚" : "Just now";
  if (diffMinutes < 60) {
    return locale === "zh"
      ? `${diffMinutes} 分钟前`
      : `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return locale === "zh" ? `${diffHours} 小时前` : `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return locale === "zh" ? `${diffDays} 天前` : `${diffDays}d ago`;
  }

  return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 任务沟通与动态时间轴组件，支持中英文国际化。
 *
 * @param props 组件属性。
 * @param props.taskId 当前关联的任务 ID。
 * @return 任务评论与动态组件。
 */
export default function TaskComments({ taskId }: { taskId: string }) {
  const { t, locale } = useTranslation();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    /**
     * 加载当前任务评论列表。
     */
    async function fetchComments() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tasks/${taskId}/comments`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || t("common.error"));
        }
        const json = await res.json();
        if (active) setComments(json.data);
      } catch (error) {
        if (active) {
          window.alert(
            error instanceof Error ? error.message : t("common.error"),
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchComments();
    return () => {
      active = false;
    };
  }, [taskId, t]);

  /**
   * 提交并发布新评论。
   *
   * @param e 表单提交事件。
   */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("common.error"));
      }
      const json = await res.json();
      setComments((prev) => [...prev, json.data]);
      setContent("");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : t("common.error"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="task-comments-section">
      <div className="comments-header-bar">
        <h3 className="comments-title">
          <MessageSquare size={16} /> {t("board.commentsTab")}
        </h3>
        <span className="comments-badge">
          {comments.length} {t("common.items")}
        </span>
      </div>

      <form className="comment-composer" onSubmit={handleSubmit}>
        <div className="composer-input-wrapper">
          <textarea
            placeholder={t("board.commentPlaceholder")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={submitting}
            maxLength={1000}
            rows={3}
          />
          <div className="composer-footer">
            <span className="composer-char-count">{content.length} / 1000</span>
            <button
              type="submit"
              disabled={!content.trim() || submitting}
              className="composer-submit-btn"
            >
              <Send size={13} />
              <span>
                {submitting ? t("common.saving") : t("board.postComment")}
              </span>
            </button>
          </div>
        </div>
      </form>

      <div className="comments-timeline">
        {loading ? (
          <div className="comments-loading-state">
            <Clock size={16} />
            <span>{t("common.loading")}</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="comments-empty-state">
            <MessageCircle size={22} />
            <p>{t("board.noComments")}</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="timeline-item">
              <div className="timeline-avatar" title={comment.author.name}>
                {getInitial(comment.author.name)}
              </div>
              <div className="timeline-card">
                <div className="timeline-header">
                  <span className="author-name">{comment.author.name}</span>
                  <span
                    className="comment-timestamp"
                    title={comment.createdAt}
                  >
                    {formatTime(comment.createdAt, locale)}
                  </span>
                </div>
                <div className="timeline-body">{comment.content}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
