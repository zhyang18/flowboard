"use client";

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { UserRole } from "@/db/schema";
import { useTranslation } from "@/lib/i18n";
import { useDashboardDialog } from "../dashboard-dialog-provider";
import PaginationControls, { useClientPagination } from "../pagination-controls";

type WorkLogRecord = {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  projectColor: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  workDate: string;
  durationHours: number;
  note: string;
  canDelete: boolean;
};

type ProjectOption = {
  id: string;
  name: string;
  code: string;
  color: string;
  archived: boolean;
  canLog: boolean;
};

type UserOption = {
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
  projectIds: string[];
};

type TaskOption = { id: string; title: string; projectId: string };

type WorkLogForm = {
  projectId: string;
  taskId: string;
  workDate: string;
  durationHours: number;
  note: string;
};

const timeReferenceDate = new Date();
const initialTo = timeReferenceDate.toISOString().slice(0, 10);
const initialFromDate = new Date(timeReferenceDate);
initialFromDate.setDate(initialFromDate.getDate() - 29);
const initialFrom = initialFromDate.toISOString().slice(0, 10);

/**
 * 渲染支持中英文国际化的工时筛选、趋势、明细和登记表单。
 *
 * @param props 组件属性。
 * @param props.initialTaskId 从任务看板或消息提醒带入的待登记任务 ID。
 * @return 工时分析组件。
 */
export default function TimeAnalysis({
  initialTaskId = "",
}: {
  initialTaskId?: string;
}) {
  const { t, getRoleLabel } = useTranslation();
  const { confirm } = useDashboardDialog();
  const [logs, setLogs] = useState<WorkLogRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WorkLogForm>({
    projectId: "",
    taskId: "",
    workDate: initialTo,
    durationHours: 1,
    note: "",
  });
  const initialTaskHandled = useRef(false);

  /**
   * 按项目、成员和日期范围加载工时数据。
   *
   * @return 加载完成后的 Promise。
   */
  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ from, to });
    if (projectId) params.set("projectId", projectId);
    if (userId) params.set("userId", userId);
    try {
      const response = await fetch(`/api/work-logs?${params}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        data?: WorkLogRecord[];
        projects?: ProjectOption[];
        users?: UserOption[];
        tasks?: TaskOption[];
        canCreate?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      const nextProjects = result.projects ?? [];
      const nextUsers = result.users ?? [];
      const nextTasks = result.tasks ?? [];
      setLogs(result.data ?? []);
      setProjects(nextProjects);
      setUsers(nextUsers);
      setTasks(nextTasks);
      setCanCreate(Boolean(result.canCreate));
      if (initialTaskId && !initialTaskHandled.current) {
        initialTaskHandled.current = true;
        const targetTask = nextTasks.find(
          (task) => task.id === initialTaskId,
        );
        const targetProject = nextProjects.find(
          (project) =>
            project.id === targetTask?.projectId && project.canLog,
        );
        if (targetTask && targetProject) {
          setForm({
            projectId: targetProject.id,
            taskId: targetTask.id,
            workDate: initialTo,
            durationHours: 1,
            note: "",
          });
          setModalOpen(true);
        } else {
          setError(t("common.error"));
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("common.error"),
      );
    } finally {
      setLoading(false);
    }
  }, [from, initialTaskId, projectId, t, to, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLogs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleLogs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return logs;
    return logs.filter(
      (log) =>
        log.taskTitle.toLowerCase().includes(normalized) ||
        log.note.toLowerCase().includes(normalized) ||
        log.userName.toLowerCase().includes(normalized),
    );
  }, [logs, query]);

  const {
    page,
    pageSize,
    pageItems: paginatedLogs,
    setPage,
    changePageSize,
    resetPage,
  } = useClientPagination(visibleLogs);

  const metrics = useMemo(() => {
    const total = visibleLogs.reduce(
      (sum, log) => sum + log.durationHours,
      0,
    );
    const people = new Set(visibleLogs.map((log) => log.userId)).size;
    const days = new Set(
      visibleLogs.map((log) => log.workDate.slice(0, 10)),
    ).size;
    return {
      total,
      people,
      average: days ? total / days : 0,
      entries: visibleLogs.length,
    };
  }, [visibleLogs]);

  const daily = useMemo(() => {
    const result: Array<{ date: string; label: string; hours: number }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(timeReferenceDate);
      date.setDate(date.getDate() - offset);
      const key = date.toISOString().slice(0, 10);
      result.push({
        date: key,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        hours: visibleLogs
          .filter((log) => log.workDate.slice(0, 10) === key)
          .reduce((sum, log) => sum + log.durationHours, 0),
      });
    }
    return result;
  }, [visibleLogs]);
  const dailyMax = Math.max(8, ...daily.map((item) => item.hours));
  const projectPagination = useClientPagination(projects);

  /**
   * 在当前用户可登记的项目中打开工时表单。
   */
  function openCreate() {
    const writableProject =
      projects.find((project) => project.id === projectId && project.canLog) ??
      projects.find((project) => project.canLog);
    const selectedProjectId = writableProject?.id ?? "";
    const selectedTask = tasks.find(
      (task) => task.projectId === selectedProjectId,
    );
    setForm({
      projectId: selectedProjectId,
      taskId: selectedTask?.id ?? "",
      workDate: initialTo,
      durationHours: 1,
      note: "",
    });
    setModalOpen(true);
  }

  /**
   * 保存工时明细并刷新任务实际工时。
   *
   * @param event 工时表单提交事件。
   * @return 保存完成后的 Promise。
   */
  async function saveLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/work-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setModalOpen(false);
      setNotice(t("time.saveSuccess"));
      await loadLogs();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("common.error"),
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * 确认后删除有权限维护的工时记录。
   *
   * @param log 待删除工时记录。
   * @return 删除完成后的 Promise。
   */
  async function deleteLog(log: WorkLogRecord) {
    const confirmed = await confirm({
      title: t("time.deleteConfirmTitle"),
      message: t("time.deleteConfirmMsg"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/work-logs/${log.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(t("time.deleteSuccess"));
      await loadLogs();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("common.error"),
      );
    }
  }

  return (
    <div className="module-page time-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">{t("time.eyebrow")}</span>
          <h2>{t("time.heading")}</h2>
          <p>{t("time.description")}</p>
        </div>
        {canCreate && (
          <button
            className="primary-action module-primary"
            type="button"
            onClick={openCreate}
          >
            <Plus size={16} /> {t("time.logTimeButton")}
          </button>
        )}
      </section>

      <section className="time-stat-grid">
        <article>
          <span className="metric-icon blue">
            <Clock3 size={19} />
          </span>
          <div>
            <small>{t("time.stats.totalHours")}</small>
            <b>{metrics.total.toFixed(1)}h</b>
          </div>
        </article>
        <article>
          <span className="metric-icon green">
            <TrendingUp size={19} />
          </span>
          <div>
            <small>{t("time.stats.dailyAverage")}</small>
            <b>{metrics.average.toFixed(1)}h</b>
          </div>
        </article>
        <article>
          <span className="metric-icon violet">
            <UserRound size={19} />
          </span>
          <div>
            <small>{t("time.stats.activeMembers")}</small>
            <b>{metrics.people}</b>
          </div>
        </article>
        <article>
          <span className="metric-icon orange">
            <Gauge size={19} />
          </span>
          <div>
            <small>{t("time.stats.totalEntries")}</small>
            <b>{metrics.entries}</b>
          </div>
        </article>
      </section>

      <section className="module-toolbar time-toolbar">
        <label className="module-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetPage();
            }}
            placeholder={t("time.searchPlaceholder")}
          />
        </label>
        <label className="module-select">
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              resetPage();
            }}
          >
            <option value="">{t("projects.allProjects")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
                {project.archived ? ` (${t("projects.archivedBadge")})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="module-select">
          <select
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              resetPage();
            }}
          >
            <option value="">{t("users.allMembers")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {getRoleLabel(user.role)}
                {user.active ? "" : ` (${t("userStatuses.disabled")})`}
              </option>
            ))}
          </select>
        </label>
        <label className="date-control">
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              resetPage();
            }}
          />
          <span>{t("common.to")}</span>
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              resetPage();
            }}
          />
        </label>
      </section>

      {error && <div className="module-alert">{error}</div>}
      <section className="time-grid">
        <article className="module-card time-chart-card">
          <header className="module-card-header">
            <div>
              <span className="eyebrow">{t("time.trendEyebrow")}</span>
              <h3>{t("time.trendHeading")}</h3>
            </div>
            <span className="header-count">{t("time.dailyTarget")}</span>
          </header>
          <div className="time-bar-chart">
            {daily.map((item) => (
              <div key={item.date}>
                <span>
                  <i
                    style={{
                      height: `${Math.max(4, (item.hours / dailyMax) * 100)}%`,
                    }}
                  />
                </span>
                <b>{item.hours.toFixed(1)}h</b>
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="module-card time-breakdown">
          <header className="module-card-header">
            <div>
              <span className="eyebrow">{t("time.distributionEyebrow")}</span>
              <h3>{t("time.distributionHeading")}</h3>
            </div>
          </header>
          <div>
            {projectPagination.pageItems.map((project) => {
              const hours = visibleLogs
                .filter((log) => log.projectId === project.id)
                .reduce((sum, log) => sum + log.durationHours, 0);
              const share = metrics.total
                ? Math.round((hours / metrics.total) * 100)
                : 0;
              return (
                <div className="time-project-row" key={project.id}>
                  <span
                    className="project-mark"
                    style={{ background: project.color }}
                  >
                    {project.code.slice(0, 2)}
                  </span>
                  <div>
                    <header>
                      <b>
                        {project.name}
                        {project.archived
                          ? ` (${t("projects.archivedBadge")})`
                          : ""}
                      </b>
                      <span>
                        {hours.toFixed(1)}h · {share}%
                      </span>
                    </header>
                    <div className="progress-track">
                      <i
                        style={{
                          width: `${share}%`,
                          background: project.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {projects.length > 0 && (
            <PaginationControls
              page={projectPagination.page}
              pageSize={projectPagination.pageSize}
              total={projects.length}
              itemLabel={t("projects.itemUnit")}
              onPageChange={projectPagination.setPage}
              onPageSizeChange={projectPagination.changePageSize}
            />
          )}
        </article>
      </section>

      <section className="module-card work-log-table-card">
        <header className="module-card-header">
          <div>
            <span className="eyebrow">{t("time.historyEyebrow")}</span>
            <h3>{t("time.historyHeading")}</h3>
          </div>
          <span className="header-count">
            {t("time.entriesCount", { count: visibleLogs.length })}
          </span>
        </header>
        {loading ? (
          <div className="module-loading">{t("common.loading")}</div>
        ) : visibleLogs.length ? (
          <div className="work-log-table-wrap">
            <table className="work-log-table">
              <thead>
                <tr>
                  <th>{t("time.dateLabel")}</th>
                  <th>{t("time.workDescriptionLabel")}</th>
                  <th>{t("common.member")}</th>
                  <th>{t("time.hoursLabel")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className="work-log-date">
                        <CalendarDays size={14} /> {log.workDate.slice(0, 10)}
                      </span>
                    </td>
                    <td>
                      <div className="work-log-content">
                        <span>
                          <i style={{ background: log.projectColor }} />{" "}
                          {log.projectCode} · {log.projectName}
                        </span>
                        <b>{log.taskTitle}</b>
                        {log.note && <small>{log.note}</small>}
                      </div>
                    </td>
                    <td>
                      <div className="work-log-member">
                        <span className="avatar">
                          {log.userName.slice(0, 1)}
                        </span>
                        <span>
                          <b>{log.userName}</b>
                          <small>{getRoleLabel(log.userRole)}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong className="work-log-hours">
                        {log.durationHours.toFixed(1)}h
                      </strong>
                    </td>
                    <td>
                      {log.canDelete && (
                        <button
                          type="button"
                          onClick={() => void deleteLog(log)}
                          aria-label={`${t("common.delete")} ${log.taskTitle}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="module-empty">
            <Clock3 size={25} /> {t("time.noLogsEmpty")}
          </div>
        )}
        {!loading && visibleLogs.length > 0 && (
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={visibleLogs.length}
            itemLabel={t("time.itemUnit")}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
          />
        )}
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="workspace-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-log-title"
          >
            <header>
              <div>
                <span className="eyebrow">{t("time.logTimeButton")}</span>
                <h2 id="work-log-title">{t("time.logTimeButton")}</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={saveLog}>
              <div className="workspace-form-grid">
                <label>
                  <span>{t("sprints.projectLabel")}</span>
                  <select
                    required
                    value={form.projectId}
                    onChange={(e) => {
                      const nextProjectId = e.target.value;
                      setForm({
                        ...form,
                        projectId: nextProjectId,
                        taskId:
                          tasks.find(
                            (task) => task.projectId === nextProjectId,
                          )?.id ?? "",
                      });
                    }}
                  >
                    <option value="">{t("projects.selectOwner")}</option>
                    {projects
                      .filter((project) => project.canLog)
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.code} · {project.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>{t("workbench.portfolioHeading")}</span>
                  <select
                    required
                    value={form.taskId}
                    onChange={(e) =>
                      setForm({ ...form, taskId: e.target.value })
                    }
                  >
                    <option value="">{t("projects.selectOwner")}</option>
                    {tasks
                      .filter((task) => task.projectId === form.projectId)
                      .map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>{t("time.dateLabel")}</span>
                  <input
                    required
                    type="date"
                    value={form.workDate}
                    onChange={(e) =>
                      setForm({ ...form, workDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>{t("time.hoursLabel")}</span>
                  <input
                    required
                    type="number"
                    min="0.1"
                    max="24"
                    step="0.1"
                    value={form.durationHours}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        durationHours: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="form-wide">
                  <span>{t("time.workDescriptionLabel")}</span>
                  <textarea
                    rows={4}
                    value={form.note}
                    onChange={(e) =>
                      setForm({ ...form, note: e.target.value })
                    }
                    placeholder={t("time.workDescriptionPlaceholder")}
                  />
                </label>
              </div>
              <footer>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {notice && (
        <div className="toast">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}
    </div>
  );
}
