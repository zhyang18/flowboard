"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * 渲染登录表单并管理登录请求状态。
 *
 * @return 登录表单组件。
 */
export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState(
    process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true"
      ? "admin@flowboard.local"
      : "",
  );
  const [password, setPassword] = useState(
    process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true"
      ? "Admin@123456"
      : "",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  /**
   * 提交邮箱、密码和记住登录选项。
   *
   * @param event 登录表单提交事件。
   * @return 登录请求完成后的 Promise。
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const result = (await response
        .json()
        .catch(() => ({ error: "登录服务异常，请稍后重试。" }))) as {
        error?: string;
      };

      if (!response.ok || result.error) {
        setError(result.error ?? "登录失败，请稍后再试。");
        return;
      }

      router.push("/dashboard/workbench");
      router.refresh();
    } catch {
      setError("网络连接异常，请检查后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      {error && (
        <div className="form-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <label className="form-field">
        <span>邮箱地址</span>
        <div className="input-shell">
          <Mail size={18} aria-hidden="true" />
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            required
            autoFocus
          />
        </div>
      </label>

      <label className="form-field">
        <span>登录密码</span>
        <div className="input-shell">
          <LockKeyhole size={18} aria-hidden="true" />
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入登录密码"
            required
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </label>

      <div className="login-options">
        <label>
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>保持登录状态</span>
        </label>
        <button type="button" onClick={() => setError("请联系组织管理员重置密码。")}>
          忘记密码？
        </button>
      </div>

      <button className="login-submit" type="submit" disabled={submitting}>
        <span>{submitting ? "正在登录…" : "登录"}</span>
        {!submitting && <ArrowRight size={18} />}
      </button>

      {process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true" && (
        <div className="demo-account">
          <span>演示账号</span>
          <p>admin@flowboard.local　/　Admin@123456</p>
        </div>
      )}
    </form>
  );
}
