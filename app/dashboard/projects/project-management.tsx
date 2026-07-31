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
  Search,
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
import type { ProjectStatus } from "@/db/schema";
import { projectStatusLabels } from "@/lib/workspace";

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
};

type Owner = { id: string; name: string };

type ProjectForm = {
  name: string;
  code: string;
  description: string;
  color: string;
  status: ProjectStatus;
  ownerId: string;
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
  startDate: "",
  dueDate: "",
};
const projectReferenceTime = Date.now();

function dateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function displayDate(value: string | null) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export default function ProjectManagement() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | ProjectStatus>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const result = (await response.json()) as {
        data?: ProjectRecord[];
        owners?: Owner[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "项目加载失败。");
      setProjects(result.data ?? []);
      setOwners(result.owners ?? []);
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
      return matchesQuery && (!status || project.status === status);
    });
  }, [projects, query, status]);

  const stats = useMemo(
    () => ({
      total: projects.length,
      active: projects.filter((project) => project.status === "active").length,
      completed: projects.filter((project) => project.status === "completed").length,
      atRisk: projects.filter(
        (project) =>
          project.dueDate &&
          project.status !== "completed" &&
          new Date(project.dueDate).getTime() < projectReferenceTime,
      ).length,
    }),
    [projects],
  );

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      ownerId: owners[0]?.id ?? "",
      startDate: new Date().toISOString().slice(0, 10),
    });
    setModalOpen(true);
  }

  function openEdit(project: ProjectRecord) {
    setEditingId(project.id);
    setForm({
      name: project.name,
      code: project.code,
      description: project.description,
      color: project.color,
      status: project.status,
      ownerId: project.ownerId,
      startDate: dateInput(project.startDate),
      dueDate: dateInput(project.dueDate),
    });
    setModalOpen(true);
  }

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
          body: JSON.stringify(form),
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
      await loadProjects();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : "归档失败。",
      );
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
        <button className="primary-action module-primary" type="button" onClick={openCreate}>
          <Plus size={16} /> 新建项目
        </button>
      </section>

      <section className="project-stat-grid">
        <article><span><FolderKanban size={18} /></span><div><small>全部项目</small><b>{stats.total}</b></div></article>
        <article><span className="green"><LayoutGrid size={18} /></span><div><small>进行中</small><b>{stats.active}</b></div></article>
        <article><span className="violet"><CheckCircle2 size={18} /></span><div><small>已完成</small><b>{stats.completed}</b></div></article>
        <article><span className="orange"><Clock3 size={18} /></span><div><small>已超期</small><b>{stats.atRisk}</b></div></article>
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
              <article className="project-card" key={project.id}>
                <header>
                  <span className="project-mark" style={{ background: project.color }}>
                    {project.code.slice(0, 2)}
                  </span>
                  <div>
                    <small>{project.code}</small>
                    <h3>{project.name}</h3>
                  </div>
                  <span className={`project-status project-${project.status}`}>
                    {projectStatusLabels[project.status]}
                  </span>
                </header>
                <p>{project.description || "暂无项目描述。"}</p>
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
                  <span><Users2 size={14} /> {project.taskCount} 项任务</span>
                  <div>
                    <button type="button" onClick={() => openEdit(project)} aria-label={`编辑 ${project.name}`}>
                      <Edit3 size={15} /> 编辑
                    </button>
                    <button type="button" onClick={() => archiveProject(project)} aria-label={`归档 ${project.name}`}>
                      <Archive size={15} />
                    </button>
                  </div>
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
                  <select required value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                    <option value="">请选择</option>
                    {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>开始日期</span>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </label>
                <label>
                  <span>截止日期</span>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </label>
                <label className="form-wide">
                  <span>项目描述</span>
                  <textarea maxLength={500} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="说明项目目标、交付范围和成功标准。" />
                </label>
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
