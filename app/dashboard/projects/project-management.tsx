"use client";

import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  FolderKanban,
  LayoutGrid,
  ListFilter,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { ProjectStatus, UserStatus } from "@/db/schema";
import { useTranslation } from "@/lib/i18n";
import AttachmentEditor from "../attachment-editor";
import AttachmentViewer from "../attachment-viewer";
import { useDashboardDialog } from "../dashboard-dialog-provider";
import PaginationControls, { useClientPagination } from "../pagination-controls";
import RichTextContent from "../rich-text-content";
import ViewModeToggle, { usePersistentViewMode } from "../view-mode-toggle";

type ProjectRecord = {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  status: ProjectStatus;
  ownerId: string;
  ownerName: string;
  startDate: string | null;
  dueDate: string | null;
  taskCount: number;
  completedTaskCount: number;
  progress: number;
  estimateHours: number;
  actualHours: number;
  memberIds: string[];
  memberCount: number;
  testerCount: number;
  attachmentCount: number;
  archived: boolean;
  canManage: boolean;
  canRestore: boolean;
  canDeletePermanently: boolean;
  overdue: boolean;
};

type Person = { id: string; name: string; role: string; status: UserStatus };

type ProjectForm = {
  name: string;
  code: string;
  description: string;
  color: string;
  status: ProjectStatus;
  ownerId: string;
  memberIds: string[];
  startDate: string;
  dueDate: string;
};

const colors = [
  "#2f7df6",
  "#7657d9",
  "#13a47b",
  "#f08a35",
  "#d64c64",
  "#1e9cad",
];

const emptyForm: ProjectForm = {
  name: "",
  code: "",
  description: "",
  color: colors[0],
  status: "planning",
  ownerId: "",
  memberIds: [],
  startDate: "",
  dueDate: "",
};

/**
 * 将接口日期转换成日期输入框值。
 *
 * @param value ISO 日期或空值。
 * @return YYYY-MM-DD 字符串。
 */
function dateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * 格式化项目卡片日期。
 *
 * @param value ISO 日期或空值。
 * @param locale 当前语言环境。
 * @param noneLabel 未设置时的占位文本。
 * @return 本地化日期文本。
 */
function displayDate(
  value: string | null,
  locale: string,
  noneLabel: string,
): string {
  if (!value) return noneLabel;
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * 渲染支持中英文国际化的项目组合、成员关系与项目维护表单。
 *
 * @return 项目管理组件。
 */
export default function ProjectManagement() {
  const { t, locale, getProjectStatusLabel } = useTranslation();
  const { confirm, prompt } = useDashboardDialog();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [owners, setOwners] = useState<Person[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | ProjectStatus>("");
  const [scope, setScope] = useState<"active" | "archived">("active");
  const [viewMode, setViewMode] = usePersistentViewMode(
    "flowboard:projects:view-mode",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [attachmentDraftToken, setAttachmentDraftToken] = useState("");
  const [saving, setSaving] = useState(false);

  const projectStatusList: ProjectStatus[] = [
    "planning",
    "active",
    "paused",
    "completed",
  ];

  /**
   * 加载当前用户可见项目和可选成员。
   *
   * @return 加载完成后的 Promise。
   */
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const result = (await response.json()) as {
        data?: ProjectRecord[];
        owners?: Person[];
        people?: Person[];
        canCreate?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setProjects(result.data ?? []);
      setOwners(result.owners ?? []);
      setPeople(result.people ?? []);
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
    const timer = window.setTimeout(() => void loadProjects(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesQuery =
        !normalized ||
        project.name.toLowerCase().includes(normalized) ||
        project.code.toLowerCase().includes(normalized) ||
        project.ownerName.toLowerCase().includes(normalized);
      const matchesScope =
        scope === "archived" ? project.archived : !project.archived;
      return (
        matchesQuery && matchesScope && (!status || project.status === status)
      );
    });
  }, [projects, query, scope, status]);

  const {
    page,
    pageSize,
    pageItems: paginatedProjects,
    setPage,
    changePageSize,
    resetPage,
  } = useClientPagination(filtered);

  const stats = useMemo(
    () => ({
      total: projects.filter((project) => !project.archived).length,
      active: projects.filter(
        (project) => !project.archived && project.status === "active",
      ).length,
      completed: projects.filter(
        (project) => !project.archived && project.status === "completed",
      ).length,
      archived: projects.filter((project) => project.archived).length,
    }),
    [projects],
  );

  /**
   * 打开新建项目表单。
   */
  function openCreate() {
    setEditingId(null);
    setAttachmentDraftToken(crypto.randomUUID());
    setForm({
      ...emptyForm,
      ownerId: owners[0]?.id ?? "",
      memberIds: owners[0]?.id ? [owners[0].id] : [],
      startDate: new Date().toISOString().slice(0, 10),
    });
    setModalOpen(true);
  }

  /**
   * 使用现有项目数据打开编辑表单。
   *
   * @param project 待编辑项目。
   */
  function openEdit(project: ProjectRecord) {
    setEditingId(project.id);
    setAttachmentDraftToken(crypto.randomUUID());
    setForm({
      name: project.name,
      code: project.code,
      description: project.description,
      color: project.color,
      status: project.status,
      ownerId: project.ownerId,
      memberIds: project.memberIds,
      startDate: dateInput(project.startDate),
      dueDate: dateInput(project.dueDate),
    });
    setModalOpen(true);
  }

  /**
   * 保存项目资料和成员关系。
   *
   * @param event 项目表单提交事件。
   * @return 保存完成后的 Promise。
   */
  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editingId ? `/api/projects/${editingId}` : "/api/projects",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, attachmentDraftToken }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setModalOpen(false);
      setNotice(t("projects.saveSuccess"));
      await loadProjects();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("common.error"),
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * 确认后归档项目。
   *
   * @param project 待归档项目。
   * @return 归档完成后的 Promise。
   */
  async function archiveProject(project: ProjectRecord) {
    const confirmed = await confirm({
      title: t("projects.archiveConfirmTitle"),
      message: t("projects.archiveConfirmMsg", { name: project.name }),
      confirmLabel: t("projects.archiveProject"),
      tone: "danger",
    });
    if (!confirmed) return;
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(t("projects.archiveSuccess"));
      setScope("archived");
      await loadProjects();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : t("common.error"),
      );
    }
  }

  /**
   * 确认后恢复已归档项目。
   *
   * @param project 待恢复项目。
   * @return 恢复完成后的 Promise。
   */
  async function restoreProject(project: ProjectRecord) {
    const confirmed = await confirm({
      title: t("projects.restoreConfirmTitle"),
      message: t("projects.restoreConfirmMsg", { name: project.name }),
      confirmLabel: t("projects.restoreProject"),
    });
    if (!confirmed) return;
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(t("projects.restoreSuccess"));
      setScope("active");
      await loadProjects();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : t("common.error"),
      );
    }
  }

  /**
   * 要求输入项目代号并二次确认后永久删除归档项目。
   *
   * @param project 待永久删除项目。
   * @return 删除完成后的 Promise。
   */
  async function permanentlyDeleteProject(project: ProjectRecord) {
    const confirmation = await prompt({
      title: t("projects.deleteConfirmTitle"),
      message: t("projects.deleteConfirmMsg", {
        name: project.name,
        code: project.code,
      }),
      inputLabel: t("projects.codeLabel"),
      placeholder: project.code,
      confirmLabel: t("projects.deletePermanently"),
      tone: "danger",
    });
    if (confirmation === null) return;
    if (confirmation.trim() !== project.code) {
      setError(t("common.error"));
      return;
    }
    const confirmed = await confirm({
      title: t("dialog.caution"),
      message: t("projects.deleteConfirmMsg", {
        name: project.name,
        code: project.code,
      }),
      confirmLabel: t("projects.deletePermanently"),
      tone: "danger",
    });
    if (!confirmed) return;
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}?permanent=true`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: confirmation.trim(),
          acknowledgeDataLoss: true,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(t("projects.deleteSuccess"));
      await loadProjects();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("common.error"),
      );
    }
  }

  return (
    <div className="module-page projects-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">{t("projects.eyebrow")}</span>
          <h2>{t("projects.heading")}</h2>
          <p>{t("projects.description")}</p>
        </div>
        {canCreate && (
          <button
            className="primary-action module-primary"
            type="button"
            onClick={openCreate}
          >
            <Plus size={16} /> {t("projects.newProject")}
          </button>
        )}
      </section>

      <section className="project-stat-grid">
        <article>
          <span>
            <FolderKanban size={18} />
          </span>
          <div>
            <small>{t("workbench.activeProjects")}</small>
            <b>{stats.total}</b>
          </div>
        </article>
        <article>
          <span className="green">
            <LayoutGrid size={18} />
          </span>
          <div>
            <small>{t("projectStatuses.active")}</small>
            <b>{stats.active}</b>
          </div>
        </article>
        <article>
          <span className="violet">
            <CheckCircle2 size={18} />
          </span>
          <div>
            <small>{t("projectStatuses.completed")}</small>
            <b>{stats.completed}</b>
          </div>
        </article>
        <article>
          <span className="orange">
            <Archive size={18} />
          </span>
          <div>
            <small>{t("projects.archivedBadge")}</small>
            <b>{stats.archived}</b>
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
            placeholder={t("projects.searchPlaceholder")}
          />
        </label>
        <label className="module-select">
          <ListFilter size={15} />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as "" | ProjectStatus);
              resetPage();
            }}
          >
            <option value="">{t("projects.allStatuses")}</option>
            {projectStatusList.map((st) => (
              <option value={st} key={st}>
                {getProjectStatusLabel(st)}
              </option>
            ))}
          </select>
        </label>
        <label className="module-select">
          <Archive size={15} />
          <select
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as "active" | "archived");
              resetPage();
            }}
          >
            <option value="active">{t("workbench.activeProjects")}</option>
            <option value="archived">{t("projects.archivedBadge")}</option>
          </select>
        </label>
        <div className="toolbar-view-options">
          <span className="toolbar-result">
            {t("pagination.totalSummary", {
              total: filtered.length,
              label: t("projects.itemUnit"),
            })}
          </span>
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            cardLabel={t("projects.cardLabel")}
            listLabel={t("projects.listLabel")}
          />
        </div>
      </section>

      {error && <div className="module-alert">{error}</div>}

      {loading ? (
        <div className="module-loading">{t("common.loading")}</div>
      ) : filtered.length ? (
        viewMode === "card" ? (
          <section className="project-card-grid" aria-label={t("projects.cardLabel")}>
            {paginatedProjects.map((project) => {
              const overrun =
                project.estimateHours > 0 &&
                project.actualHours > project.estimateHours;
              return (
                <article
                  className={`project-card ${project.archived ? "archived" : ""}`}
                  key={project.id}
                >
                  <header>
                    <span
                      className="project-mark"
                      style={{ background: project.color }}
                    >
                      {project.code.slice(0, 2)}
                    </span>
                    <div>
                      <small>{project.code}</small>
                      <h3>{project.name}</h3>
                    </div>
                    <span
                      className={`project-status ${project.archived ? "project-archived" : `project-${project.status}`}`}
                    >
                      {project.archived
                        ? t("projects.archivedBadge")
                        : getProjectStatusLabel(project.status)}
                    </span>
                  </header>
                  <RichTextContent
                    value={project.description}
                    emptyText={t("common.empty")}
                  />
                  {project.attachmentCount > 0 && (
                    <AttachmentViewer
                      owner={{ type: "projectId", id: project.id }}
                    />
                  )}
                  <div className="project-owner">
                    <span className="avatar">
                      {project.ownerName.slice(0, 1)}
                    </span>
                    <div>
                      <small>{t("projects.owner")}</small>
                      <b>{project.ownerName}</b>
                    </div>
                    <span>
                      <CalendarDays size={13} />{" "}
                      {displayDate(project.dueDate, locale, t("common.none"))}
                    </span>
                  </div>
                  <div className="project-progress">
                    <header>
                      <span>
                        {t("workbench.taskCountSummary", {
                          done: project.completedTaskCount,
                          total: project.taskCount,
                        })}
                      </span>
                      <b>{project.progress}%</b>
                    </header>
                    <div className="progress-track">
                      <i
                        style={{
                          width: `${project.progress}%`,
                          background: project.color,
                        }}
                      />
                    </div>
                  </div>
                  <div className="project-hours">
                    <span className={overrun ? "risk" : ""}>
                      <Clock3 size={14} />{" "}
                      {t("projects.hoursRatio", {
                        actual: project.actualHours.toFixed(1),
                        estimate: project.estimateHours.toFixed(1),
                      })}
                    </span>
                  </div>
                  <footer>
                    <span>
                      <Users2 size={14} />{" "}
                      {t("projects.membersCount", {
                        count: project.memberCount,
                      })}{" "}
                      ·{" "}
                      {t("projects.tasksCount", {
                        count: project.taskCount,
                      })}
                    </span>
                    {!project.archived && project.canManage && (
                      <div>
                        <button
                          type="button"
                          onClick={() => openEdit(project)}
                          aria-label={`${t("common.edit")} ${project.name}`}
                        >
                          <Edit3 size={15} /> {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => archiveProject(project)}
                          aria-label={`${t("projects.archiveProject")} ${project.name}`}
                        >
                          <Archive size={15} />
                        </button>
                      </div>
                    )}
                    {project.archived &&
                      (project.canRestore || project.canDeletePermanently) && (
                        <div>
                          {project.canRestore && (
                            <button
                              type="button"
                              onClick={() => void restoreProject(project)}
                              aria-label={`${t("projects.restoreProject")} ${project.name}`}
                            >
                              <RotateCcw size={15} /> {t("projects.restoreProject")}
                            </button>
                          )}
                          {project.canDeletePermanently && (
                            <button
                              className="danger"
                              type="button"
                              onClick={() =>
                                void permanentlyDeleteProject(project)
                              }
                              aria-label={`${t("projects.deletePermanently")} ${project.name}`}
                            >
                              <Trash2 size={15} />{" "}
                              {t("projects.deletePermanently")}
                            </button>
                          )}
                        </div>
                      )}
                  </footer>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="entity-table-shell" aria-label={t("projects.listLabel")}>
            <table className="entity-table project-entity-table">
              <thead>
                <tr>
                  <th>{t("projects.nameLabel")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("projects.owner")} / {t("common.dueDate")}</th>
                  <th>{t("common.progress")}</th>
                  <th>{t("common.hours")}</th>
                  <th>{t("common.member")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProjects.map((project) => {
                  const overrun =
                    project.estimateHours > 0 &&
                    project.actualHours > project.estimateHours;
                  const hasActions =
                    (!project.archived && project.canManage) ||
                    (project.archived &&
                      (project.canRestore || project.canDeletePermanently));
                  return (
                    <tr
                      className={project.archived ? "archived" : ""}
                      key={project.id}
                    >
                      <td>
                        <div className="entity-title-cell">
                          <span
                            className="project-mark"
                            style={{ background: project.color }}
                          >
                            {project.code.slice(0, 2)}
                          </span>
                          <div>
                            <small>{project.code}</small>
                            <strong>{project.name}</strong>
                            {project.attachmentCount > 0 && (
                              <AttachmentViewer
                                owner={{ type: "projectId", id: project.id }}
                              />
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`project-status ${project.archived ? "project-archived" : `project-${project.status}`}`}
                        >
                          {project.archived
                            ? t("projects.archivedBadge")
                            : getProjectStatusLabel(project.status)}
                        </span>
                      </td>
                      <td>
                        <div className="entity-stacked-value">
                          <strong>{project.ownerName}</strong>
                          <small>
                            <CalendarDays size={12} />{" "}
                            {displayDate(project.dueDate, locale, t("common.none"))}
                          </small>
                        </div>
                      </td>
                      <td>
                        <div className="entity-progress-cell">
                          <span>
                            <small>
                              {t("workbench.taskCountSummary", {
                                done: project.completedTaskCount,
                                total: project.taskCount,
                              })}
                            </small>
                            <b>{project.progress}%</b>
                          </span>
                          <div className="progress-track">
                            <i
                              style={{
                                width: `${project.progress}%`,
                                background: project.color,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="entity-stacked-value">
                          <span className={overrun ? "risk" : ""}>
                            {t("projects.hoursRatio", {
                              actual: project.actualHours.toFixed(1),
                              estimate: project.estimateHours.toFixed(1),
                            })}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="entity-stacked-value">
                          <span>
                            <Users2 size={12} />{" "}
                            {t("projects.membersCount", {
                              count: project.memberCount,
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="entity-actions-cell">
                        {hasActions ? (
                          <div className="entity-actions">
                            {!project.archived && project.canManage && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEdit(project)}
                                  aria-label={`${t("common.edit")} ${project.name}`}
                                >
                                  <Edit3 size={14} /> {t("common.edit")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void archiveProject(project)}
                                  aria-label={`${t("projects.archiveProject")} ${project.name}`}
                                >
                                  <Archive size={14} /> {t("projects.archiveProject")}
                                </button>
                              </>
                            )}
                            {project.archived && project.canRestore && (
                              <button
                                type="button"
                                onClick={() => void restoreProject(project)}
                                aria-label={`${t("projects.restoreProject")} ${project.name}`}
                              >
                                <RotateCcw size={14} /> {t("projects.restoreProject")}
                              </button>
                            )}
                            {project.archived && project.canDeletePermanently && (
                              <button
                                className="danger"
                                type="button"
                                onClick={() =>
                                  void permanentlyDeleteProject(project)
                                }
                                aria-label={`${t("projects.deletePermanently")} ${project.name}`}
                              >
                                <Trash2 size={14} /> {t("common.delete")}
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
          <FolderKanban size={30} />
          <b>{t("projects.noMatches")}</b>
          <span>{t("projects.createFirstProject")}</span>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          itemLabel={t("projects.itemUnit")}
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
        />
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="workspace-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-modal-title"
          >
            <header>
              <div>
                <span className="eyebrow">
                  {editingId
                    ? t("projects.modalEditTitle")
                    : t("projects.modalCreateTitle")}
                </span>
                <h2 id="project-modal-title">
                  {editingId
                    ? t("projects.modalEditTitle")
                    : t("projects.modalCreateTitle")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={saveProject}>
              <div className="workspace-form-grid">
                <label>
                  <span>{t("projects.nameLabel")}</span>
                  <input
                    required
                    maxLength={80}
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder={t("projects.namePlaceholder")}
                  />
                </label>
                <label>
                  <span>{t("projects.codeLabel")}</span>
                  <input
                    required
                    maxLength={20}
                    value={form.code}
                    onChange={(e) =>
                      setForm({ ...form, code: e.target.value.toUpperCase() })
                    }
                    placeholder={t("projects.codePlaceholder")}
                  />
                </label>
                <label>
                  <span>{t("projects.statusLabel")}</span>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value as ProjectStatus,
                      })
                    }
                  >
                    {projectStatusList.map((st) => (
                      <option key={st} value={st}>
                        {getProjectStatusLabel(st)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("projects.ownerLabel")}</span>
                  <select
                    required
                    value={form.ownerId}
                    onChange={(e) => {
                      const ownerId = e.target.value;
                      setForm({
                        ...form,
                        ownerId,
                        memberIds: [
                          ...new Set(
                            [ownerId, ...form.memberIds].filter(Boolean),
                          ),
                        ],
                      });
                    }}
                  >
                    <option value="">{t("projects.selectOwner")}</option>
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="form-wide project-member-fieldset">
                  <legend>{t("projects.membersLabel")}</legend>
                  <div className="project-member-picker">
                    {people.map((person) => {
                      const checked = form.memberIds.includes(person.id);
                      const isOwner = form.ownerId === person.id;
                      return (
                        <label key={person.id}>
                          <input
                            type="checkbox"
                            checked={checked || isOwner}
                            disabled={
                              isOwner || (!checked && person.status !== "active")
                            }
                            onChange={(event) =>
                              setForm({
                                ...form,
                                memberIds: event.target.checked
                                  ? [...new Set([...form.memberIds, person.id])]
                                  : form.memberIds.filter(
                                      (id) => id !== person.id,
                                    ),
                              })
                            }
                          />
                          <span>{person.name}</span>
                          <small>
                            {isOwner
                              ? t("projects.owner")
                              : person.role === "viewer"
                                ? t("roles.viewer")
                                : person.role === "tester"
                                  ? t("roles.tester")
                                  : t("roles.member")}
                          </small>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <label>
                  <span>{t("common.startDate")}</span>
                  <input
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
                    type="date"
                    value={form.dueDate}
                    onChange={(e) =>
                      setForm({ ...form, dueDate: e.target.value })
                    }
                  />
                </label>
                <AttachmentEditor
                  draftToken={attachmentDraftToken}
                  owner={
                    editingId
                      ? { type: "projectId", id: editingId }
                      : undefined
                  }
                  value={form.description}
                  onChange={(description) =>
                    setForm({ ...form, description })
                  }
                  label={t("projects.descriptionLabel")}
                  placeholder={t("projects.descriptionPlaceholder")}
                />
                <fieldset className="form-wide color-fieldset">
                  <legend>{t("projects.colorLabel")}</legend>
                  {colors.map((color) => (
                    <button
                      className={form.color === color ? "selected" : ""}
                      style={{ background: color }}
                      type="button"
                      key={color}
                      onClick={() => setForm({ ...form, color })}
                      aria-label={`${t("projects.colorLabel")} ${color}`}
                    />
                  ))}
                </fieldset>
              </div>
              <footer>
                <button type="button" onClick={() => setModalOpen(false)}>
                  {t("common.cancel")}
                </button>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? t("common.saving")
                    : editingId
                      ? t("common.save")
                      : t("common.create")}
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
