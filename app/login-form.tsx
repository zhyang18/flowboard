"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

const showDemoCredentials = process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true";
const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "admin@flowboard.local";
const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "Admin@123456";

/**
 * 渲染支持中英文国际化的登录表单并管理登录请求状态。
 *
 * @return 登录表单组件。
 */
export default function LoginForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState(showDemoCredentials ? demoEmail : "");
  const [password, setPassword] = useState(showDemoCredentials ? demoPassword : "");
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
        .catch(() => ({ error: t("login.serviceError") }))) as {
        error?: string;
      };

      if (!response.ok || result.error) {
        setError(result.error ?? t("login.loginFailed"));
        return;
      }

      router.push("/dashboard/workbench");
      router.refresh();
    } catch {
      setError(t("login.networkError"));
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
        <span>{t("login.emailLabel")}</span>
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
        <span>{t("login.passwordLabel")}</span>
        <div className="input-shell">
          <LockKeyhole size={18} aria-hidden="true" />
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("login.passwordPlaceholder")}
            required
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={
              showPassword
                ? t("login.hidePassword")
                : t("login.showPassword")
            }
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
          <span>{t("login.rememberMe")}</span>
        </label>
        <button
          type="button"
          onClick={() => setError(t("login.forgotPasswordHint"))}
        >
          {t("login.forgotPassword")}
        </button>
      </div>

      <button className="login-submit" type="submit" disabled={submitting}>
        <span>
          {submitting ? t("login.loggingIn") : t("login.loginButton")}
        </span>
        {!submitting && <ArrowRight size={18} />}
      </button>

      {showDemoCredentials && (
        <div className="demo-account">
          <span>{t("login.demoAccount")}</span>
          <p>
            {demoEmail}　/　{demoPassword}
          </p>
        </div>
      )}
    </form>
  );
}
