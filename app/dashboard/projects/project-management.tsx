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
import { projectStatusLabels } from "@/lib/workspace";
import AttachmentEditor from "../attachment-editor";
import AttachmentViewer from "../attachment-viewer";
import RichTextContent from "../rich-text-content";

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

const colors = ["#2f7df6", "#7657d9", "#13a47b", "#f08a35", "#d64c64", "#1e9cad"];

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
function dateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

/**
 * 格式化项目卡片日期。
 *
 * @param value ISO 日期或空值。
 * @return 中文日期文本。
 */
function displayDate(value: string | null) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/**
 * 渲染项目组合、成员关系和项目维护表单。
 *
 * @return 项目管理组件。
 */
export default function ProjectManagement() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [owners, setOwners] = useState<Person[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | ProjectStatus>("");
  const [scope, setScope] = useState<"active" | "archived">("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [attachmentDraftToken, setAttachmentDraftToken] = useState("");
  const [saving, setSaving] = useState(false);

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
      if (!response.ok) throw new Error(result.error ?? "项目加载失败。");
      setProjects(result.data ?? []);
      setOwners(result.owners ?? []);
      setPeople(result.people ?? []);
      setCanCreate(Boolean(result.canCreate));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "项目加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

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
      const matchesScope = scope === "archived" ? project.archived : !project.archived;
      return matchesQuery && matchesScope && (!status || project.status === status);
    });
  }, [projects, query, scope, status]);

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
   *
   * @return 无返回值。
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
   * @return 无返回值。
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
      if (!response.ok) throw new Error(result.error ?? "项目保存失败。");
      setModalOpen(false);
      setNotice(editingId ? "项目已更新" : "项目已创建");
      await loadProjects();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "项目保存失败。");
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
    if (!window.confirm(`确定归档项目“${project.name}”吗？任务数据会保留。`)) return;
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "归档失败。");
      setNotice("项目已归档");
      setScope("archived");
      await loadProjects();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : "归档失败。",
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
    if (!window.confirm(`确定恢复项目“${project.name}”吗？恢复后可以继续维护任务和工时。`)) {
      return;
    }
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "恢复失败。");
      setNotice("项目已恢复");
      setScope("active");
      await loadProjects();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "恢复失败。");
    }
  }

  /**
   * 要求输入项目代号并二次确认后永久删除归档项目。
   *
   * @param project 待永久删除项目。
   * @return 删除完成后的 Promise。
   */
  async function permanentlyDeleteProject(project: ProjectRecord) {
    const confirmation = window.prompt(
      `永久删除会清除项目的任务、迭代、成员关系和全部工时，且无法恢复。请输入项目代号 ${project.code} 确认：`,
    );
    if (confirmation === null) return;
    if (confirmation.trim() !== project.code) {
      setError("项目代号输入不匹配，永久删除已取消。");
      return;
    }
    if (!window.confirm(`最后确认：永久删除项目“${project.name}”及其全部业务数据？`)) {
      return;
    }
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
      if (!response.ok) throw new Error(result.error ?? "永久删除失败。");
      setNotice("项目已永久删除");
      await loadProjects();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "永久删除失败。");
    }
  }

  return (
    <div className="module-page projects-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">项目组合管理</span>
          <h2>让目标、进度与投入保持一致</h2>
          <p>统一维护项目状态、负责人、交付周期和任务工时。</p>
        </div>
        {canCreate && (
          <button className="primary-action module-primary" type="button" onClick={openCreate}>
            <Plus size={16} /> 新建项目
          </button>
        )}
      </section>

      <section className="project-stat-grid">
        <article><span><FolderKanban size={18} /></span><div><small>有效项目</small><b>{stats.total}</b></div></article>
        <article><span className="green"><LayoutGrid size={18} /></span><div><small>进行中</small><b>{stats.active}</b></div></article>
        <article><span className="violet"><CheckCircle2 size={18} /></span><div><small>已完成</small><b>{stats.completed}</b></div></article>
        <article><span className="orange"><Archive size={18} /></span><div><small>已归档</small><b>{stats.archived}</b></div></article>
      </section>

      <section className="module-toolbar">
        <label className="module-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目名称、代号或负责人"
          />
        </label>
        <label className="module-select">
          <ListFilter size={15} />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "" | ProjectStatus)}
          >
            <option value="">全部状态</option>
            {Object.entries(projectStatusLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="module-select">
          <Archive size={15} />
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as "active" | "archived")}
          >
            <option value="active">有效项目</option>
            <option value="archived">已归档项目</option>
          </select>
        </label>
        <span className="toolbar-result">显示 {filtered.length} 个项目</span>
      </section>

      {error && <div className="module-alert">{error}</div>}

      {loading ? (
        <div className="module-loading">正在加载项目…</div>
      ) : filtered.length ? (
        <section className="project-card-grid">
          {filtered.map((project) => {
            const overrun =
              project.estimateHours > 0 &&
              project.actualHours > project.estimateHours;
            return (
              <article className={`project-card ${project.archived ? "archived" : ""}`} key={project.id}>
                <header>
                  <span className="project-mark" style={{ background: project.color }}>
                    {project.code.slice(0, 2)}
                  </span>
                  <div>
                    <small>{project.code}</small>
                    <h3>{project.name}</h3>
                  </div>
                  <span className={`project-status ${project.archived ? "project-archived" : `project-${project.status}`}`}>
                    {project.archived ? "已归档" : projectStatusLabels[project.status]}
                  </span>
                </header>
                <RichTextContent value={project.description} emptyText="暂无项目描述。" />
                {project.attachmentCount > 0 && <AttachmentViewer owner={{ type: "projectId", id: project.id }} />}
                <div className="project-owner">
                  <span className="avatar">{project.ownerName.slice(0, 1)}</span>
                  <div><small>项目负责人</small><b>{project.ownerName}</b></div>
                  <span><CalendarDays size={13} /> {displayDate(project.dueDate)}</span>
                </div>
                <div className="project-progress">
                  <header>
                    <span>任务进度 · {project.completedTaskCount}/{project.taskCount}</span>
                    <b>{project.progress}%</b>
                  </header>
                  <div className="progress-track">
                    <i style={{ width: `${project.progress}%`, background: project.color }} />
                  </div>
                </div>
                <div className="project-hours">
                  <span><Clock3 size={14} /> 预估 <b>{project.estimateHours.toFixed(1)}h</b></span>
                  <span className={overrun ? "risk" : ""}>
                    实际 <b>{project.actualHours.toFixed(1)}h</b>
                  </span>
                </div>
                <footer>
                  <span><Users2 size={14} /> {project.memberCount} 位成员（测试 {project.testerCount}）· {project.taskCount} 项任务</span>
                  {!project.archived && project.canManage && (
                    <div>
                      <button type="button" onClick={() => openEdit(project)} aria-label={`编辑 ${project.name}`}>
                        <Edit3 size={15} /> 编辑
                      </button>
                      <button type="button" onClick={() => archiveProject(project)} aria-label={`归档 ${project.name}`}>
                        <Archive size={15} />
                      </button>
                    </div>
                  )}
                  {project.archived && (project.canRestore || project.canDeletePermanently) && (
                    <div>
                      {project.canRestore && (
                        <button type="button" onClick={() => void restoreProject(project)} aria-label={`恢复 ${project.name}`}>
                          <RotateCcw size={15} /> 恢复
                        </button>
                      )}
                      {project.canDeletePermanently && (
                        <button className="danger" type="button" onClick={() => void permanentlyDeleteProject(project)} aria-label={`永久删除 ${project.name}`}>
                          <Trash2 size={15} /> 永久删除
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
        <div className="module-empty large">
          <FolderKanban size={30} />
          <b>没有符合条件的项目</b>
          <span>调整筛选条件，或创建一个新项目。</span>
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
            <header>
              <div>
                <span className="eyebrow">{editingId ? "编辑项目" : "新项目"}</span>
                <h2 id="project-modal-title">{editingId ? "更新项目资料" : "创建一个交付项目"}</h2>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <form onSubmit={saveProject}>
              <div className="workspace-form-grid">
                <label>
                  <span>项目名称</span>
                  <input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：FlowBoard 2.0" />
                </label>
                <label>
                  <span>项目代号</span>
                  <input required maxLength={20} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="FLOW2" />
                </label>
                <label>
                  <span>项目状态</span>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
                    {Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>负责人</span>
                  <select required value={form.ownerId} onChange={(e) => {
                    const ownerId = e.target.value;
                    setForm({
                      ...form,
                      ownerId,
                      memberIds: [...new Set([ownerId, ...form.memberIds].filter(Boolean))],
                    });
                  }}>
                    <option value="">请选择</option>
                    {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                  </select>
                </label>
                <fieldset className="form-wide project-member-fieldset">
                  <legend>项目成员（可多选）</legend>
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
                                  : form.memberIds.filter((id) => id !== person.id),
                              })
                            }
                          />
                          <span>
                            {person.name}
                            {person.status === "disabled"
                              ? "（已停用，请移除）"
                              : person.status === "invited"
                                ? "（待激活，请移除）"
                                : ""}
                          </span>
                          <small>{isOwner ? "负责人" : person.role === "viewer" ? "只读" : person.role === "tester" ? "测试" : "研发"}</small>
                        </label>
                      );
                    })}
                  </div>
                  <p>负责人会自动加入；研发成员可指派为开发负责人，测试人员可独立指派为测试负责人并参与迭代验收和工时登记。</p>
                </fieldset>
                <label>
                  <span>开始日期</span>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </label>
                <label>
                  <span>截止日期</span>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </label>
                <AttachmentEditor
                  draftToken={attachmentDraftToken}
                  owner={editingId ? { type: "projectId", id: editingId } : undefined}
                  value={form.description}
                  onChange={(description) => setForm({ ...form, description })}
                  label="项目说明与附件"
                  placeholder="说明项目目标、交付范围和成功标准；上传图片后会插入预览。"
                />
                <fieldset className="form-wide color-fieldset">
                  <legend>识别颜色</legend>
                  {colors.map((color) => (
                    <button
                      className={form.color === color ? "selected" : ""}
                      style={{ background: color }}
                      type="button"
                      key={color}
                      onClick={() => setForm({ ...form, color })}
                      aria-label={`选择颜色 ${color}`}
                    />
                  ))}
                </fieldset>
              </div>
              <footer>
                <button type="button" onClick={() => setModalOpen(false)}>取消</button>
                <button className="primary-action" type="submit" disabled={saving}>
                  {saving ? "保存中…" : editingId ? "保存修改" : "创建项目"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {notice && <div className="toast"><CheckCircle2 size={16} /> {notice}</div>}
    </div>
  );
}
