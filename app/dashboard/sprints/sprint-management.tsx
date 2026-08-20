"use client";

import {
  CalendarRange,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Edit3,
  Gauge,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { SprintStatus, TaskStatus } from "@/db/schema";
import { useTranslation } from "@/lib/i18n";
import { useDashboardDialog } from "../dashboard-dialog-provider";
import PaginationControls, { useClientPagination } from "../pagination-controls";
import ViewModeToggle, { usePersistentViewMode } from "../view-mode-toggle";

type SprintTask = {
  id: string;
  sprintId: string | null;
  title: string;
  status: TaskStatus;
  testerId: string | null;
  estimateHours: number;
  actualHours: number;
};

type SprintRecord = {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  projectColor: string;
  name: string;
  goal: string;
  status: SprintStatus;
  capacityHours: number;
  startDate: string;
  endDate: string;
  taskCount: number;
  completedTaskCount: number;
  testedTaskCount: number;
  progress: number;
  estimateHours: number;
  actualHours: number;
  tasks: SprintTask[];
  canManage: boolean;
};

type ProjectOption = {
  id: string;
  name: string;
  code: string;
  color: string;
  canManage: boolean;
};

type CandidateTask = SprintTask & {
  projectId: string;
  sprintName: string | null;
  sprintStatus: SprintStatus | null;
  testerName: string | null;
};

type SprintForm = {
  projectId: string;
  name: string;
  goal: string;
  capacityHours: number;
  startDate: string;
  endDate: string;
};

const emptyForm: SprintForm = {
  projectId: "",
  name: "",
  goal: "",
  capacityHours: 80,
  startDate: "",
  endDate: "",
};

/**
 * 将接口日期转换成日期输入框值。
 *
 * @param value ISO 日期。
 * @return YYYY-MM-DD 字符串。
 */
function inputDate(value: string): string {
  return value.slice(0, 10);
}

/**
 * 格式化迭代周期日期。
 *
 * @param value ISO 日期。
 * @param locale 当前语言环境。
 * @return 本地化简短日期文本。
 */
function displayDate(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * 渲染支持中英文国际化的迭代列表、容量和任务范围管理。
 *
 * @return 迭代管理组件。
 */
export default function SprintManagement() {
  const { t, locale, getSprintStatusLabel, getTaskStatusLabel } =
    useTranslation();
  const { confirm } = useDashboardDialog();
  const [sprints, setSprints] = useState<SprintRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | SprintStatus>("");
  const [viewMode, setViewMode] = usePersistentViewMode(
    "flowboard:sprints:view-mode",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SprintForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [planningSprint, setPlanningSprint] = useState<SprintRecord | null>(null);
  const [candidateTasks, setCandidateTasks] = useState<CandidateTask[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [planningLoading, setPlanningLoading] = useState(false);
  const planningTaskPagination = useClientPagination(candidateTasks);

  const sprintStatusList: SprintStatus[] = ["planned", "active", "completed"];

  /**
   * 加载可见迭代及项目权限。
   *
   * @return 加载完成后的 Promise。
   */
  const loadSprints = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/sprints", { cache: "no-store" });
      const result = (await response.json()) as {
        data?: SprintRecord[];
        projects?: ProjectOption[];
        canCreate?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setSprints(result.data ?? []);
      setProjects(result.projects ?? []);
      setCanCreate(Boolean(result.canCreate));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("common.error"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSprints(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSprints]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sprints.filter(
      (sprint) =>
        (!status || sprint.status === status) &&
        (!normalized ||
          sprint.name.toLowerCase().includes(normalized) ||
          sprint.projectName.toLowerCase().includes(normalized)),
    );
  }, [query, sprints, status]);

  const {
    page,
    pageSize,
    pageItems: paginatedSprints,
    setPage,
    changePageSize,
    resetPage,
  } = useClientPagination(filtered);

  const stats = useMemo(
    () => ({
      active: sprints.filter((sprint) => sprint.status === "active").length,
      planned: sprints.filter((sprint) => sprint.status === "planned").length,
      completed: sprints.filter((sprint) => sprint.status === "completed").length,
      capacity: sprints
        .filter((sprint) => sprint.status === "active")
        .reduce((sum, sprint) => sum + sprint.capacityHours, 0),
    }),
    [sprints],
  );

  /**
   * 打开新建迭代表单并生成默认周期。
   */
  function openCreate() {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 13);
    setEditingId(null);
    setForm({
      ...emptyForm,
      projectId: projects.find((project) => project.canManage)?.id ?? "",
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });
    setFormOpen(true);
  }

  /**
   * 使用现有迭代数据打开编辑表单。
   *
   * @param sprint 待编辑迭代。
   */
  function openEdit(sprint: SprintRecord) {
    setEditingId(sprint.id);
    setForm({
      projectId: sprint.projectId,
      name: sprint.name,
      goal: sprint.goal,
      capacityHours: sprint.capacityHours,
      startDate: inputDate(sprint.startDate),
      endDate: inputDate(sprint.endDate),
    });
    setFormOpen(true);
  }

  /**
   * 创建或更新迭代。
   *
   * @param event 迭代表单提交事件。
   * @return 保存完成后的 Promise。
   */
  async function saveSprint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editingId ? `/api/sprints/${editingId}` : "/api/sprints",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setFormOpen(false);
      setNotice(t("sprints.saveSuccess"));
      await loadSprints();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("common.error"),
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * 按既定生命周期启动、完成或重新打开迭代。
   *
   * @param sprint 待流转的迭代。
   * @param targetStatus 目标迭代状态。
   * @return 状态流转完成后的 Promise。
   */
  async function transitionSprint(
    sprint: SprintRecord,
    targetStatus: SprintStatus,
  ): Promise<void> {
    if (
      targetStatus === "completed" &&
      sprint.completedTaskCount !== sprint.taskCount
    ) {
      setError(t("common.error"));
      return;
    }
    const confirmation =
      targetStatus === "completed"
        ? t("sprints.deleteConfirmMsg", { name: sprint.name })
        : null;

    if (targetStatus === "completed" || (targetStatus === "active" && sprint.status === "completed")) {
      const confirmed = await confirm({
        title:
          targetStatus === "completed"
            ? t("projectStatuses.completed")
            : t("sprints.planTasks"),
        message:
          confirmation ??
          t("sprints.deleteConfirmMsg", { name: sprint.name }),
        confirmLabel: t("common.confirm"),
        tone: targetStatus === "completed" ? "danger" : "default",
      });
      if (!confirmed) return;
    }

    setTransitioningId(sprint.id);
    setError("");
    try {
      const response = await fetch(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(t("common.success"));
      await loadSprints();
    } catch (transitionError) {
      setError(
        transitionError instanceof Error
          ? transitionError.message
          : t("common.error"),
      );
    } finally {
      setTransitioningId(null);
    }
  }

  /**
   * 加载同项目任务并打开迭代规划。
   *
   * @param sprint 待规划迭代。
   * @return 任务加载完成后的 Promise。
   */
  async function openPlanning(sprint: SprintRecord) {
    setPlanningSprint(sprint);
    planningTaskPagination.resetPage();
    setPlanningLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks?projectId=${sprint.projectId}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        data?: CandidateTask[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      const rows = result.data ?? [];
      setCandidateTasks(rows);
      setSelectedTaskIds(
        rows
          .filter((task) => task.sprintId === sprint.id)
          .map((task) => task.id),
      );
    } catch (planningError) {
      setError(
        planningError instanceof Error
          ? planningError.message
          : t("common.error"),
      );
      setPlanningSprint(null);
    } finally {
      setPlanningLoading(false);
    }
  }

  /**
   * 用当前勾选结果替换迭代任务范围。
   *
   * @return 保存完成后的 Promise。
   */
  async function savePlanning() {
    if (!planningSprint) return;
    setPlanningLoading(true);
    try {
      const response = await fetch(`/api/sprints/${planningSprint.id}/tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: selectedTaskIds }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setPlanningSprint(null);
      setNotice(t("sprints.planSuccess"));
      await loadSprints();
    } catch (planningError) {
      setError(
        planningError instanceof Error
          ? planningError.message
          : t("common.error"),
      );
    } finally {
      setPlanningLoading(false);
    }
  }

  /**
   * 确认后删除非进行中迭代。
   *
   * @param sprint 待删除迭代。
   * @return 删除完成后的 Promise。
   */
  async function deleteSprint(sprint: SprintRecord) {
    const confirmed = await confirm({
      title: t("sprints.deleteConfirmTitle"),
      message: t("sprints.deleteConfirmMsg", { name: sprint.name }),
      confirmLabel: t("sprints.deleteSprint"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/sprints/${sprint.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(t("sprints.deleteSuccess"));
      await loadSprints();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("common.error"),
      );
    }
  }

  return (
    <div className="module-page sprint-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">{t("sprints.eyebrow")}</span>
          <h2>{t("sprints.heading")}</h2>
          <p>{t("sprints.description")}</p>
        </div>
        {canCreate && (
          <button
            className="primary-action module-primary"
            type="button"
            onClick={openCreate}
          >
            <Plus size={16} /> {t("sprints.newSprint")}
          </button>
        )}
      </section>

      <section className="sprint-stat-grid">
        <article>
          <span className="metric-icon blue">
            <CircleDot size={19} />
          </span>
          <div>
            <small>{t("sprintStatuses.active")}</small>
            <b>{stats.active}</b>
          </div>
        </article>
        <article>
          <span className="metric-icon violet">
            <CalendarRange size={19} />
          </span>
          <div>
            <small>{t("sprintStatuses.planned")}</small>
            <b>{stats.planned}</b>
          </div>
        </article>
        <article>
          <span className="metric-icon green">
            <CheckCircle2 size={19} />
          </span>
          <div>
            <small>{t("sprintStatuses.completed")}</small>
            <b>{stats.completed}</b>
          </div>
        </article>
        <article>
          <span className="metric-icon orange">
            <Gauge size={19} />
          </span>
          <div>
            <small>{t("sprints.capacityLabel")}</small>
            <b>{stats.capacity.toFixed(0)}h</b>
          </div>
        </article>
      </section>

      <section className="module-toolbar">
        <label className="module-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetPage();
            }}
            placeholder={t("sprints.searchPlaceholder")}
          />
        </label>
        <label className="module-select">
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as "" | SprintStatus);
              resetPage();
            }}
          >
            <option value="">{t("sprints.allStatuses")}</option>
            {sprintStatusList.map((st) => (
              <option key={st} value={st}>
                {getSprintStatusLabel(st)}
              </option>
            ))}
          </select>
        </label>
        <div className="toolbar-view-options">
          <span className="toolbar-result">
            {t("pagination.totalSummary", {
              total: filtered.length,
              label: t("sprints.itemUnit"),
            })}
          </span>
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            cardLabel={t("sprints.cardView")}
            listLabel={t("sprints.listView")}
          />
        </div>
      </section>

      {error && <div className="module-alert">{error}</div>}
      {loading ? (
        <div className="module-loading">{t("common.loading")}</div>
      ) : filtered.length ? (
        viewMode === "card" ? (
          <section className="sprint-list" aria-label={t("sprints.cardView")}>
            {paginatedSprints.map((sprint) => {
              const capacityUsed = sprint.capacityHours
                ? Math.round(
                    (sprint.estimateHours / sprint.capacityHours) * 100,
                  )
                : 0;
              return (
                <article className="sprint-card" key={sprint.id}>
                  <div
                    className="sprint-accent"
                    style={{ background: sprint.projectColor }}
                  />
                  <header>
                    <div>
                      <small>
                        <i style={{ background: sprint.projectColor }} />{" "}
                        {sprint.projectCode} · {sprint.projectName}
                      </small>
                      <h3>{sprint.name}</h3>
                    </div>
                    <span className={`sprint-status sprint-${sprint.status}`}>
                      {getSprintStatusLabel(sprint.status)}
                    </span>
                  </header>
                  <p>{sprint.goal || t("common.none")}</p>
                  <div className="sprint-dates">
                    <CalendarRange size={15} />
                    <span>
                      {displayDate(sprint.startDate, locale)} —{" "}
                      {displayDate(sprint.endDate, locale)}
                    </span>
                  </div>
                  <div className="sprint-progress-row">
                    <div>
                      <header>
                        <span>
                          {t("sprints.scopeRatio", {
                            done: sprint.completedTaskCount,
                            total: sprint.taskCount,
                          })}
                        </span>
                        <b>{sprint.progress}%</b>
                      </header>
                      <div className="progress-track">
                        <i
                          style={{
                            width: `${sprint.progress}%`,
                            background: sprint.projectColor,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <header>
                        <span>{t("sprints.capacityHours", { capacity: sprint.capacityHours.toFixed(0) })}</span>
                        <b className={capacityUsed > 100 ? "risk" : ""}>
                          {capacityUsed}%
                        </b>
                      </header>
                      <div className="progress-track">
                        <i
                          style={{
                            width: `${Math.min(100, capacityUsed)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="sprint-hours">
                    <span>
                      <small>{t("sprints.capacityLabel")}</small>
                      <b>{sprint.capacityHours.toFixed(1)}h</b>
                    </span>
                    <span>
                      <small>{t("sprints.estimateLabel")}</small>
                      <b>{sprint.estimateHours.toFixed(1)}h</b>
                    </span>
                    <span>
                      <small>{t("sprints.actualLabel")}</small>
                      <b>{sprint.actualHours.toFixed(1)}h</b>
                    </span>
                  </div>
                  {sprint.canManage && (
                    <footer>
                      {sprint.status !== "completed" ? (
                        <button
                          type="button"
                          onClick={() => void openPlanning(sprint)}
                        >
                          <ClipboardList size={14} /> {t("sprints.planTasks")}
                        </button>
                      ) : (
                        <span>{t("projects.archivedBadge")}</span>
                      )}
                      <div>
                        {sprint.status === "planned" && (
                          <>
                            <button
                              type="button"
                              disabled={transitioningId === sprint.id}
                              onClick={() =>
                                void transitionSprint(sprint, "active")
                              }
                            >
                              <Play size={14} /> {t("sprintStatuses.active")}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(sprint)}
                            >
                              <Edit3 size={14} /> {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteSprint(sprint)}
                              aria-label={`${t("common.delete")} ${sprint.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        {sprint.status === "active" && (
                          <>
                            <button
                              type="button"
                              disabled={transitioningId === sprint.id}
                              onClick={() =>
                                void transitionSprint(sprint, "completed")
                              }
                            >
                              <CheckCircle2 size={14} />{" "}
                              {t("sprintStatuses.completed")}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(sprint)}
                            >
                              <Edit3 size={14} /> {t("common.edit")}
                            </button>
                          </>
                        )}
                        {sprint.status === "completed" && (
                          <button
                            type="button"
                            disabled={transitioningId === sprint.id}
                            onClick={() =>
                              void transitionSprint(sprint, "active")
                            }
                          >
                            <RotateCcw size={14} /> {t("common.reset")}
                          </button>
                        )}
                      </div>
                    </footer>
                  )}
                </article>
              );
            })}
          </section>
        ) : (
          <section className="entity-table-shell" aria-label={t("sprints.listView")}>
            <table className="entity-table sprint-entity-table">
              <thead>
                <tr>
                  <th>{t("sprints.nameLabel")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("sprints.cycleLabel")}</th>
                  <th>{t("common.progress")}</th>
                  <th>{t("sprints.capacityLabel")}</th>
                  <th>{t("common.hours")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSprints.map((sprint) => {
                  const capacityUsed = sprint.capacityHours
                    ? Math.round(
                        (sprint.estimateHours / sprint.capacityHours) * 100,
                      )
                    : 0;
                  return (
                    <tr key={sprint.id}>
                      <td>
                        <div className="entity-title-cell">
                          <i
                            className="entity-color-dot"
                            style={{ background: sprint.projectColor }}
                          />
                          <div>
                            <small>
                              {sprint.projectCode} · {sprint.projectName}
                            </small>
                            <strong>{sprint.name}</strong>
                            <span className="entity-description">
                              {sprint.goal || t("common.none")}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`sprint-status sprint-${sprint.status}`}
                        >
                          {getSprintStatusLabel(sprint.status)}
                        </span>
                      </td>
                      <td>
                        <div className="entity-stacked-value">
                          <span>
                            <CalendarRange size={12} />{" "}
                            {displayDate(sprint.startDate, locale)}
                          </span>
                          <small>{t("common.to")} {displayDate(sprint.endDate, locale)}</small>
                        </div>
                      </td>
                      <td>
                        <div className="entity-progress-cell">
                          <span>
                            <small>
                              {sprint.completedTaskCount}/{sprint.taskCount}
                            </small>
                            <b>{sprint.progress}%</b>
                          </span>
                          <div className="progress-track">
                            <i
                              style={{
                                width: `${sprint.progress}%`,
                                background: sprint.projectColor,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="entity-progress-cell">
                          <span>
                            <small>
                              {sprint.estimateHours.toFixed(1)}/
                              {sprint.capacityHours.toFixed(1)}h
                            </small>
                            <b className={capacityUsed > 100 ? "risk" : ""}>
                              {capacityUsed}%
                            </b>
                          </span>
                          <div className="progress-track">
                            <i
                              style={{
                                width: `${Math.min(100, capacityUsed)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="entity-stacked-value">
                          <span>
                            {t("workbench.actualVsEstimateHours")}:{" "}
                            <b>{sprint.actualHours.toFixed(1)}h</b>
                          </span>
                        </div>
                      </td>
                      <td className="entity-actions-cell">
                        {sprint.canManage ? (
                          <div className="entity-actions">
                            {sprint.status !== "completed" && (
                              <button
                                type="button"
                                onClick={() => void openPlanning(sprint)}
                              >
                                <ClipboardList size={14} />{" "}
                                {t("sprints.planTasks")}
                              </button>
                            )}
                            {sprint.status === "planned" && (
                              <>
                                <button
                                  type="button"
                                  disabled={transitioningId === sprint.id}
                                  onClick={() =>
                                    void transitionSprint(sprint, "active")
                                  }
                                >
                                  <Play size={14} />{" "}
                                  {t("sprintStatuses.active")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEdit(sprint)}
                                >
                                  <Edit3 size={14} /> {t("common.edit")}
                                </button>
                                <button
                                  className="danger"
                                  type="button"
                                  onClick={() => void deleteSprint(sprint)}
                                  aria-label={`${t("common.delete")} ${sprint.name}`}
                                >
                                  <Trash2 size={14} /> {t("common.delete")}
                                </button>
                              </>
                            )}
                            {sprint.status === "active" && (
                              <>
                                <button
                                  type="button"
                                  disabled={transitioningId === sprint.id}
                                  onClick={() =>
                                    void transitionSprint(sprint, "completed")
                                  }
                                >
                                  <CheckCircle2 size={14} />{" "}
                                  {t("sprintStatuses.completed")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEdit(sprint)}
                                >
                                  <Edit3 size={14} /> {t("common.edit")}
                                </button>
                              </>
                            )}
                            {sprint.status === "completed" && (
                              <button
                                type="button"
                                disabled={transitioningId === sprint.id}
                                onClick={() =>
                                  void transitionSprint(sprint, "active")
                                }
                              >
                                <RotateCcw size={14} /> {t("common.reset")}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="entity-no-action">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )
      ) : (
        <div className="module-empty large">
          <CalendarRange size={30} />
          <b>{t("sprints.noMatches")}</b>
          <span>{t("sprints.createFirstSprint")}</span>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          itemLabel={t("sprints.itemUnit")}
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
        />
      )}

      {formOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="workspace-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sprint-form-title"
          >
            <header>
              <div>
                <span className="eyebrow">
                  {editingId
                    ? t("sprints.modalEditTitle")
                    : t("sprints.modalCreateTitle")}
                </span>
                <h2 id="sprint-form-title">
                  {editingId
                    ? t("sprints.modalEditTitle")
                    : t("sprints.modalCreateTitle")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={saveSprint}>
              <div className="workspace-form-grid">
                <label>
                  <span>{t("sprints.projectLabel")}</span>
                  <select
                    required
                    value={form.projectId}
                    onChange={(e) =>
                      setForm({ ...form, projectId: e.target.value })
                    }
                  >
                    <option value="">{t("sprints.selectProject")}</option>
                    {projects
                      .filter((project) => project.canManage)
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.code} · {project.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>{t("sprints.nameLabel")}</span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder={t("sprints.namePlaceholder")}
                  />
                </label>
                <label>
                  <span>{t("sprints.capacityLabel")}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.capacityHours}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        capacityHours: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>{t("common.startDate")}</span>
                  <input
                    required
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span>{t("common.dueDate")}</span>
                  <input
                    required
                    type="date"
                    value={form.endDate}
                    onChange={(e) =>
                      setForm({ ...form, endDate: e.target.value })
                    }
                  />
                </label>
                <label className="form-wide">
                  <span>{t("sprints.goalLabel")}</span>
                  <textarea
                    rows={4}
                    value={form.goal}
                    onChange={(e) =>
                      setForm({ ...form, goal: e.target.value })
                    }
                    placeholder={t("sprints.goalPlaceholder")}
                  />
                </label>
              </div>
              <footer>
                <button type="button" onClick={() => setFormOpen(false)}>
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

      {planningSprint && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="workspace-modal sprint-planning-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="planning-title"
          >
            <header>
              <div>
                <span className="eyebrow">{t("sprints.planModalTitle")}</span>
                <h2 id="planning-title">{planningSprint.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setPlanningSprint(null)}
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </header>
            <div className="planning-summary">
              <span>
                {t("sprints.tasksCount", {
                  count: selectedTaskIds.length,
                })}
              </span>
              <b>
                {candidateTasks
                  .filter((task) => selectedTaskIds.includes(task.id))
                  .reduce((sum, task) => sum + task.estimateHours, 0)
                  .toFixed(1)}
                h / {planningSprint.capacityHours.toFixed(1)}h
              </b>
            </div>
            <div className="planning-task-list">
              {planningTaskPagination.pageItems.map((task) => {
                const belongsToOtherSprint = Boolean(
                  task.sprintId && task.sprintId !== planningSprint.id,
                );
                return (
                  <label
                    key={task.id}
                    className={`${selectedTaskIds.includes(task.id) ? "selected" : ""} ${belongsToOtherSprint ? "blocked" : ""}`.trim()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.includes(task.id)}
                      disabled={belongsToOtherSprint}
                      onChange={(event) =>
                        setSelectedTaskIds((current) =>
                          event.target.checked
                            ? [...current, task.id]
                            : current.filter((id) => id !== task.id),
                        )
                      }
                    />
                    <span>
                      <b>{task.title}</b>
                      <small>
                        {getTaskStatusLabel(task.status)} ·{" "}
                        {t("workbench.actualVsEstimateHours")}:{" "}
                        {task.estimateHours.toFixed(1)}h
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            {candidateTasks.length > 0 && (
              <PaginationControls
                page={planningTaskPagination.page}
                pageSize={planningTaskPagination.pageSize}
                total={candidateTasks.length}
                itemLabel={t("workbench.portfolioHeading")}
                onPageChange={planningTaskPagination.setPage}
                onPageSizeChange={planningTaskPagination.changePageSize}
              />
            )}
            <footer className="planning-footer">
              <button
                type="button"
                onClick={() => setPlanningSprint(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="primary-action"
                type="button"
                disabled={planningLoading}
                onClick={() => void savePlanning()}
              >
                {planningLoading ? t("common.saving") : t("common.save")}
              </button>
            </footer>
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
