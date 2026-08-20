"use client";

import { BarChart3, Check, Clock3, ShieldCheck, Users2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import LoginForm from "./login-form";

/**
 * 渲染支持中英文国际化的登录页展示区域及表单。
 *
 * @return 登录展示视图组件。
 */
export default function LoginView() {
  const { t } = useTranslation();

  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="FlowBoard Product Showcase">
        <div className="login-brand">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <b>FlowBoard</b>
            <small>{t("login.tagline")}</small>
          </span>
        </div>

        <div className="showcase-copy">
          <span className="showcase-pill">
            <ShieldCheck size={15} /> {t("login.heroBadge")}
          </span>
          <h1>
            {t("login.heroTitle1")}
            <br />
            {t("login.heroTitle2")}
          </h1>
          <p>{t("login.heroDesc")}</p>
        </div>

        <div className="showcase-board" aria-hidden="true">
          <header>
            <span>{t("login.sprintTitle")}</span>
            <span>{t("login.deliveryOverview")}</span>
          </header>
          <div className="showcase-metrics">
            <div>
              <span className="mini-icon blue">
                <BarChart3 size={17} />
              </span>
              <p>{t("login.sprintProgress")}</p>
              <b>68%</b>
            </div>
            <div>
              <span className="mini-icon teal">
                <Clock3 size={17} />
              </span>
              <p>{t("login.actualHours")}</p>
              <b>357h</b>
            </div>
            <div>
              <span className="mini-icon violet">
                <Users2 size={17} />
              </span>
              <p>{t("login.activeMembers")}</p>
              <b>24</b>
            </div>
          </div>
          <div className="showcase-columns">
            {[
              [t("taskStatuses.todo"), t("login.showcaseTask1"), "8h"],
              [t("taskStatuses.in_progress"), t("login.showcaseTask2"), "6.5h"],
              [t("taskStatuses.done"), t("login.showcaseTask3"), "9h"],
            ].map(([status, task, hours], index) => (
              <article key={status}>
                <span className={`column-dot dot-${index}`} />
                <small>{status}</small>
                <div>
                  <b>{task}</b>
                  <span>{hours}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <p className="showcase-footnote">
          <Check size={14} /> {t("login.footerNotice")}
        </p>
      </section>

      <section className="login-panel">
        <div className="login-mobile-brand">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <b>FlowBoard</b>
        </div>
        <div className="login-card">
          <div className="login-heading">
            <span className="eyebrow">{t("login.welcomeBack")}</span>
            <h2>{t("login.loginTitle")}</h2>
            <p>{t("login.loginDesc")}</p>
          </div>
          <LoginForm />
        </div>
        <footer>
          <span>{t("login.footerCopyright")}</span>
          <span>{t("login.footerTerms")}</span>
        </footer>
      </section>
    </main>
  );
}
