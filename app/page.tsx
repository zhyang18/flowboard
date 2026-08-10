import { redirect } from "next/navigation";
import { BarChart3, Check, Clock3, ShieldCheck, Users2 } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

/**
 * 根据会话状态渲染登录页或跳转工作台。
 *
 * @return 登录页面组件。
 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard/workbench");

  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="FlowBoard 产品简介">
        <div className="login-brand">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <b>FlowBoard</b>
            <small>研发效能平台</small>
          </span>
        </div>

        <div className="showcase-copy">
          <span className="showcase-pill">
            <ShieldCheck size={15} /> 团队协作，从清晰可控开始
          </span>
          <h1>
            让每一次交付
            <br />
            都更有把握
          </h1>
          <p>
            统一管理团队、权限与项目节奏，让预估、执行和复盘形成完整闭环。
          </p>
        </div>

        <div className="showcase-board" aria-hidden="true">
          <header>
            <span>迭代 2026-08</span>
            <span>本周交付概览</span>
          </header>
          <div className="showcase-metrics">
            <div>
              <span className="mini-icon blue"><BarChart3 size={17} /></span>
              <p>迭代进度</p>
              <b>68%</b>
            </div>
            <div>
              <span className="mini-icon teal"><Clock3 size={17} /></span>
              <p>实际工时</p>
              <b>357h</b>
            </div>
            <div>
              <span className="mini-icon violet"><Users2 size={17} /></span>
              <p>活跃成员</p>
              <b>24</b>
            </div>
          </div>
          <div className="showcase-columns">
            {[
              ["待处理", "项目成员权限校验", "8h"],
              ["进行中", "工时汇总一致性优化", "6.5h"],
              ["已完成", "交付报表口径校准", "9h"],
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
          <Check size={14} /> 数据驱动决策，专注高质量交付
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
            <span className="eyebrow">欢迎回来</span>
            <h2>登录 FlowBoard</h2>
            <p>使用你的组织账号继续进入研发工作台</p>
          </div>
          <LoginForm />
        </div>
        <footer>
          <span>© 2026 FlowBoard</span>
          <span>隐私政策 · 服务条款</span>
        </footer>
      </section>
    </main>
  );
}
