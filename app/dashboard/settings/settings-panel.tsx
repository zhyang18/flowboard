"use client";

import {
  BellRing,
  CheckCircle2,
  Clock3,
  Database,
  Globe2,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

type SettingsForm = {
  workspaceName: string;
  timezone: string;
  weekStart: number;
  defaultEstimateHours: number;
  workdayHours: number;
  requireEstimate: boolean;
  autoCompleteTimestamp: boolean;
  notifyOverdue: boolean;
};

const defaultForm: SettingsForm = {
  workspaceName: "FlowBoard 研发中心",
  timezone: "Asia/Singapore",
  weekStart: 1,
  defaultEstimateHours: 4,
  workdayHours: 8,
  requireEstimate: true,
  autoCompleteTimestamp: true,
  notifyOverdue: true,
};

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      className={`settings-toggle ${checked ? "on" : ""}`}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}

export default function SettingsPanel() {
  const router = useRouter();
  const [form, setForm] = useState(defaultForm);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const result = (await response.json()) as {
        data?: SettingsForm;
        canManage?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "设置加载失败。");
      setForm(result.data ?? defaultForm);
      setCanManage(Boolean(result.canManage));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "设置加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "设置保存失败。");
      setNotice("工作空间设置已保存");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "设置保存失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-page settings-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">工作空间配置</span>
          <h2>让团队按统一规则协作</h2>
          <p>维护工作空间信息、工时规则、任务行为和提醒偏好。</p>
        </div>
      </section>

      {error && <div className="module-alert">{error}</div>}
      {!canManage && !loading && <div className="settings-readonly"><ShieldCheck size={16} /> 当前账号为只读模式，仅管理员可以修改工作空间设置。</div>}

      <form className="settings-layout" onSubmit={saveSettings}>
        <div className="settings-main">
          <section className="module-card settings-section">
            <header><span className="settings-section-icon blue"><Globe2 size={18} /></span><div><h3>基本信息</h3><p>用于导航、日期和团队工作节奏。</p></div></header>
            <div className="settings-fields">
              <label className="field-wide"><span>工作空间名称</span><input disabled={!canManage} value={form.workspaceName} onChange={(event) => setForm({ ...form, workspaceName: event.target.value })} /></label>
              <label><span>默认时区</span><select disabled={!canManage} value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option value="Asia/Singapore">Asia/Singapore（UTC+8）</option><option value="Asia/Shanghai">Asia/Shanghai（UTC+8）</option><option value="Asia/Tokyo">Asia/Tokyo（UTC+9）</option><option value="UTC">UTC</option></select></label>
              <label><span>每周起始日</span><select disabled={!canManage} value={form.weekStart} onChange={(event) => setForm({ ...form, weekStart: Number(event.target.value) })}><option value={1}>星期一</option><option value={0}>星期日</option></select></label>
            </div>
          </section>

          <section className="module-card settings-section">
            <header><span className="settings-section-icon violet"><Clock3 size={18} /></span><div><h3>工时规则</h3><p>定义任务预估和团队容量的默认口径。</p></div></header>
            <div className="settings-fields">
              <label><span>默认任务预估</span><div className="number-suffix"><input disabled={!canManage} type="number" min="0.5" step="0.5" value={form.defaultEstimateHours} onChange={(event) => setForm({ ...form, defaultEstimateHours: Number(event.target.value) })} /><i>小时</i></div></label>
              <label><span>标准工作日</span><div className="number-suffix"><input disabled={!canManage} type="number" min="1" max="24" step="0.5" value={form.workdayHours} onChange={(event) => setForm({ ...form, workdayHours: Number(event.target.value) })} /><i>小时</i></div></label>
              <div className="settings-rule field-wide"><div><b>任务必须填写预估工时</b><p>创建任务时要求提供明确的时间预估。</p></div><Toggle checked={form.requireEstimate} disabled={!canManage} onChange={(value) => setForm({ ...form, requireEstimate: value })} /></div>
            </div>
          </section>

          <section className="module-card settings-section">
            <header><span className="settings-section-icon green"><Settings2 size={18} /></span><div><h3>任务与提醒</h3><p>控制完成时间记录和交付风险提醒。</p></div></header>
            <div className="settings-rules">
              <div className="settings-rule"><div><b>自动记录实际完成时间</b><p>任务移动至“已完成”时自动保存完成时间。</p></div><Toggle checked={form.autoCompleteTimestamp} disabled={!canManage} onChange={(value) => setForm({ ...form, autoCompleteTimestamp: value })} /></div>
              <div className="settings-rule"><div><b>逾期任务提醒</b><p>任务超过截止日期后在工作台和报表中突出显示。</p></div><Toggle checked={form.notifyOverdue} disabled={!canManage} onChange={(value) => setForm({ ...form, notifyOverdue: value })} /></div>
            </div>
          </section>
        </div>

        <aside className="settings-side">
          <section className="module-card settings-status-card">
            <span className="settings-section-icon green"><Database size={19} /></span>
            <div><small>数据持久化</small><b>PostgreSQL 已连接</b><p>项目、任务、迭代、工时和设置均保存在服务端数据库。</p></div>
            <span className="settings-health"><i /> 运行正常</span>
          </section>
          <section className="module-card settings-status-card">
            <span className="settings-section-icon blue"><BellRing size={19} /></span>
            <div><small>当前提醒策略</small><b>{form.notifyOverdue ? "逾期风险已开启" : "逾期风险已关闭"}</b><p>工作台与报表使用同一套任务交付规则。</p></div>
          </section>
          {canManage && <button className="settings-save-button" type="submit" disabled={saving || loading}><Save size={16} /> {saving ? "保存中…" : "保存全部设置"}</button>}
        </aside>
      </form>
      {notice && <div className="toast"><CheckCircle2 size={16} /> {notice}</div>}
    </div>
  );
}
