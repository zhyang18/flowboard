"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Clock, MessageCircle, MessageSquare, Send } from "lucide-react";

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
 * @return 友好时间显示文本。
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 任务沟通与动态时间轴组件。
 * 提供现代化的时间轴对话视图，提升卡片内部沟通体验。
 *
 * @param taskId 当前关联的任务 ID。
 */
export default function TaskComments({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchComments() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tasks/${taskId}/comments`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "获取评论失败");
        }
        const json = await res.json();
        if (active) setComments(json.data);
      } catch (error) {
        if (active) {
          window.alert(error instanceof Error ? error.message : "获取评论失败");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchComments();
    return () => {
      active = false;
    };
  }, [taskId]);

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
        throw new Error(err.error || "发布评论失败");
      }
      const json = await res.json();
      setComments((prev) => [...prev, json.data]);
      setContent("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "发布评论失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="task-comments-section">
      <div className="comments-header-bar">
        <h3 className="comments-title">
          <MessageSquare size={16} /> 沟通与动态
        </h3>
        <span className="comments-badge">{comments.length} 条讨论</span>
      </div>

      {/* 评论编辑输入框 */}
      <form className="comment-composer" onSubmit={handleSubmit}>
        <div className="composer-input-wrapper">
          <textarea
            placeholder="发表讨论、补充细节或更新任务进展..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={submitting}
            maxLength={1000}
            rows={3}
          />
          <div className="composer-footer">
            <span className="composer-char-count">
              {content.length} / 1000
            </span>
            <button
              type="submit"
              disabled={!content.trim() || submitting}
              className="composer-submit-btn"
            >
              <Send size={13} />
              <span>{submitting ? "发送中..." : "发表评论"}</span>
            </button>
          </div>
        </div>
      </form>

      {/* 时间轴讨论列表 */}
      <div className="comments-timeline">
        {loading ? (
          <div className="comments-loading-state">
            <Clock size={16} />
            <span>加载讨论记录中...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="comments-empty-state">
            <MessageCircle size={22} />
            <p>暂无沟通记录，发表第一条评论吧！</p>
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
                  <span className="comment-timestamp" title={comment.createdAt}>
                    {formatTime(comment.createdAt)}
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
