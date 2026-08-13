"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MessageSquare, Send } from "lucide-react";

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
 * 任务评论与动态列表组件。
 * 允许用户浏览当前任务的历史沟通记录，并发表新评论。
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
    return () => { active = false; };
  }, [taskId, alert]);

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
      <h3 className="comments-header">
        <MessageSquare size={16} /> 沟通与动态
      </h3>
      <div className="comments-list">
        {loading ? (
          <div className="comments-loading">加载中...</div>
        ) : comments.length === 0 ? (
          <div className="comments-empty">暂无沟通记录，发表第一条评论。</div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="comment-item">
              <div className="comment-meta">
                <strong>{comment.author.name}</strong>
                <span className="comment-time">
                  {new Date(comment.createdAt).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </span>
              </div>
              <div className="comment-content">{comment.content}</div>
            </div>
          ))
        )}
      </div>
      <form className="comment-form" onSubmit={handleSubmit}>
        <textarea
          placeholder="发表讨论、更新进展..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={submitting}
          maxLength={1000}
          rows={3}
        />
        <div className="comment-form-actions">
          <button type="submit" disabled={!content.trim() || submitting} className="primary-action">
            <Send size={14} /> 发表
          </button>
        </div>
      </form>
    </div>
  );
}
