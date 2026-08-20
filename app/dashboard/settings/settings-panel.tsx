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
import { SUPPORTED_LOCALES, useTranslation, type Locale } from "@/lib/i18n";

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

type DatabaseCapacity = {
  used: string;
  remaining: string;
  total: string;
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

/**
 * 渲染设置项的布尔开关。
 *
 * @param props 开关组件属性。
 * @param props.checked 当前是否开启。
 * @param props.disabled 当前是否禁止操作。
 * @param props.onChange 开关状态变化时的回调。
 * @return 可访问的开关按钮。
 */
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

/**
 * 渲染工作空间设置与服务状态面板，包含界面中英文切换、时区、工时规则与交付提醒配置。
 *
 * @return 工作空间设置页面内容。
 */
export default function SettingsPanel() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const [form, setForm] = useState(defaultForm);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [databaseCapacity, setDatabaseCapacity] = useState<DatabaseCapacity | null>(null);

  /**
   * 从服务端加载工作空间设置和数据库使用容量。
   *
   * @return 设置加载完成后的 Promise。
   */
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    setDatabaseCapacity(null);
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const result = (await response.json()) as {
        data?: SettingsForm;
        canManage?: boolean;
        databaseCapacity?: DatabaseCapacity;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? t("settings.loadError"));
      setForm(result.data ?? defaultForm);
      setCanManage(Boolean(result.canManage));
      setDatabaseCapacity(result.databaseCapacity ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("settings.loadError"));
      setDatabaseCapacity(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /**
   * 校验并提交工作空间设置。
   *
   * @param event 设置表单提交事件。
   * @return 设置保存完成后的 Promise。
   */
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
      if (!response.ok) throw new Error(result.error ?? t("settings.saveError"));
      setNotice(t("settings.saveSuccess"));
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("settings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-page settings-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">{t("settings.eyebrow")}</span>
          <h2>{t("settings.heading")}</h2>
          <p>{t("settings.description")}</p>
        </div>
      </section>

      {error && <div className="module-alert">{error}</div>}
      {!canManage && !loading && (
        <div className="settings-readonly">
          <ShieldCheck size={16} /> {t("settings.readonlyNotice")}
        </div>
      )}

      <form className="settings-layout" onSubmit={saveSettings}>
        <div className="settings-main">
          <section className="module-card settings-section">
            <header>
              <span className="settings-section-icon blue">
                <Globe2 size={18} />
              </span>
              <div>
                <h3>{t("settings.basicInfo")}</h3>
                <p>{t("settings.basicInfoDesc")}</p>
              </div>
            </header>
            <div className="settings-fields">
              <label className="field-wide">
                <span>{t("settings.workspaceName")}</span>
                <input
                  disabled={!canManage}
                  value={form.workspaceName}
                  onChange={(event) =>
                    setForm({ ...form, workspaceName: event.target.value })
                  }
                />
              </label>
              <label>
                <span>{t("settings.language")}</span>
                <select
                  value={locale}
                  onChange={(event) => setLocale(event.target.value as Locale)}
                >
                  {SUPPORTED_LOCALES.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("settings.timezone")}</span>
                <select
                  disabled={!canManage}
                  value={form.timezone}
                  onChange={(event) =>
                    setForm({ ...form, timezone: event.target.value })
                  }
                >
                  <option value="Asia/Singapore">Asia/Singapore（UTC+8）</option>
                  <option value="Asia/Shanghai">Asia/Shanghai（UTC+8）</option>
                  <option value="Asia/Tokyo">Asia/Tokyo（UTC+9）</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>
              <label>
                <span>{t("settings.weekStart")}</span>
                <select
                  disabled={!canManage}
                  value={form.weekStart}
                  onChange={(event) =>
                    setForm({ ...form, weekStart: Number(event.target.value) })
                  }
                >
                  <option value={1}>{t("settings.monday")}</option>
                  <option value={0}>{t("settings.sunday")}</option>
                </select>
              </label>
            </div>
          </section>

          <section className="module-card settings-section">
            <header>
              <span className="settings-section-icon violet">
                <Clock3 size={18} />
              </span>
              <div>
                <h3>{t("settings.workRules")}</h3>
                <p>{t("settings.workRulesDesc")}</p>
              </div>
            </header>
            <div className="settings-fields">
              <label>
                <span>{t("settings.defaultEstimate")}</span>
                <div className="number-suffix">
                  <input
                    disabled={!canManage}
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={form.defaultEstimateHours}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        defaultEstimateHours: Number(event.target.value),
                      })
                    }
                  />
                  <i>{t("common.hours")}</i>
                </div>
              </label>
              <label>
                <span>{t("settings.standardWorkday")}</span>
                <div className="number-suffix">
                  <input
                    disabled={!canManage}
                    type="number"
                    min="1"
                    max="24"
                    step="0.5"
                    value={form.workdayHours}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        workdayHours: Number(event.target.value),
                      })
                    }
                  />
                  <i>{t("common.hours")}</i>
                </div>
              </label>
              <div className="settings-rule field-wide">
                <div>
                  <b>{t("settings.requireEstimateTitle")}</b>
                  <p>{t("settings.requireEstimateDesc")}</p>
                </div>
                <Toggle
                  checked={form.requireEstimate}
                  disabled={!canManage}
                  onChange={(value) =>
                    setForm({ ...form, requireEstimate: value })
                  }
                />
              </div>
            </div>
          </section>

          <section className="module-card settings-section">
            <header>
              <span className="settings-section-icon green">
                <Settings2 size={18} />
              </span>
              <div>
                <h3>{t("settings.tasksAndAlerts")}</h3>
                <p>{t("settings.tasksAndAlertsDesc")}</p>
              </div>
            </header>
            <div className="settings-rules">
              <div className="settings-rule">
                <div>
                  <b>{t("settings.autoCompleteTitle")}</b>
                  <p>{t("settings.autoCompleteDesc")}</p>
                </div>
                <Toggle
                  checked={form.autoCompleteTimestamp}
                  disabled={!canManage}
                  onChange={(value) =>
                    setForm({ ...form, autoCompleteTimestamp: value })
                  }
                />
              </div>
              <div className="settings-rule">
                <div>
                  <b>{t("settings.notifyOverdueTitle")}</b>
                  <p>{t("settings.notifyOverdueDesc")}</p>
                </div>
                <Toggle
                  checked={form.notifyOverdue}
                  disabled={!canManage}
                  onChange={(value) =>
                    setForm({ ...form, notifyOverdue: value })
                  }
                />
              </div>
            </div>
          </section>
        </div>

        <aside className="settings-side">
          <section className="module-card settings-status-card">
            <span className="settings-section-icon green">
              <Database size={19} />
            </span>
            <div>
              <small>{t("settings.dataPersistence")}</small>
              <b>{t("settings.dbConnected")}</b>
              <p>{t("settings.dbDesc")}</p>
            </div>
            <span className="settings-health">
              <i /> {t("settings.runningNormal")}{" "}
              <span
                className="settings-database-size"
                title={
                  databaseCapacity
                    ? `Neon Free ${databaseCapacity.total}`
                    : undefined
                }
              >
                {databaseCapacity
                  ? t("settings.dbCapacityUsed", {
                      used: databaseCapacity.used,
                      remaining: databaseCapacity.remaining,
                    })
                  : loading
                    ? t("settings.dbCapacityLoading")
                    : t("settings.dbCapacityUnavailable")}
              </span>
            </span>
          </section>
          <section className="module-card settings-status-card">
            <span className="settings-section-icon blue">
              <BellRing size={19} />
            </span>
            <div>
              <small>{t("settings.currentAlertPolicy")}</small>
              <b>
                {form.notifyOverdue
                  ? t("settings.overdueAlertsEnabled")
                  : t("settings.overdueAlertsDisabled")}
              </b>
              <p>{t("settings.alertPolicyDesc")}</p>
            </div>
          </section>
          {canManage && (
            <button
              className="settings-save-button"
              type="submit"
              disabled={saving || loading}
            >
              <Save size={16} />{" "}
              {saving ? t("settings.savingButton") : t("settings.saveButton")}
            </button>
          )}
        </aside>
      </form>
      {notice && (
        <div className="toast">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}
    </div>
  );
}
