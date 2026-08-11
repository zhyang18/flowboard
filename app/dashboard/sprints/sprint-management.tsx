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
import { sprintStatusLabels, taskStatusLabels } from "@/lib/workspace";

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
function inputDate(value: string) {
  return value.slice(0, 10);
}

/**
 * 格式化迭代周期日期。
 *
 * @param value ISO 日期。
 * @return 简短中文日期文本。
 */
function displayDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/**
 * 渲染迭代列表、容量和任务范围管理。
 *
 * @return 迭代管理组件。
 */
export default function SprintManagement() {
  const [sprints, setSprints] = useState<SprintRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | SprintStatus>("");
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
      if (!response.ok) throw new Error(result.error ?? "迭代加载失败。");
      setSprints(result.data ?? []);
      setProjects(result.projects ?? []);
      setCanCreate(Boolean(result.canCreate));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "迭代加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

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
   *
   * @return 无返回值。
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
   * @return 无返回值。
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
      if (!response.ok) throw new Error(result.error ?? "迭代保存失败。");
      setFormOpen(false);
      setNotice(editingId ? "迭代已更新" : "迭代已创建");
      await loadSprints();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "迭代保存失败。");
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
      setError("迭代仍有未完成任务，请先完成任务或在任务规划中将其移出。");
      return;
    }
    const confirmation =
      targetStatus === "completed"
        ? `确定完成迭代“${sprint.name}”吗？完成后任务和工时将锁定。`
        : targetStatus === "active" && sprint.status === "completed"
          ? `确定重新打开迭代“${sprint.name}”吗？它会恢复为进行中。`
          : null;
    if (confirmation && !window.confirm(confirmation)) return;

    setTransitioningId(sprint.id);
    setError("");
    try {
      const response = await fetch(`/api/sprints/${sprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "迭代状态更新失败。");
      setNotice(
        targetStatus === "completed"
          ? "迭代已完成并锁定"
          : sprint.status === "completed"
            ? "迭代已重新打开"
            : "迭代已启动",
      );
      await loadSprints();
    } catch (transitionError) {
      setError(
        transitionError instanceof Error
          ? transitionError.message
          : "迭代状态更新失败。",
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
      if (!response.ok) throw new Error(result.error ?? "任务加载失败。");
      const rows = result.data ?? [];
      setCandidateTasks(rows);
      setSelectedTaskIds(
        rows.filter((task) => task.sprintId === sprint.id).map((task) => task.id),
      );
    } catch (planningError) {
      setError(
        planningError instanceof Error ? planningError.message : "任务加载失败。",
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
      if (!response.ok) throw new Error(result.error ?? "迭代规划保存失败。");
      setPlanningSprint(null);
      setNotice("迭代任务已更新");
      await loadSprints();
    } catch (planningError) {
      setError(
        planningError instanceof Error
          ? planningError.message
          : "迭代规划保存失败。",
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
    if (!window.confirm(`确定删除迭代“${sprint.name}”吗？任务会回到未规划状态。`)) {
      return;
    }
    try {
      const response = await fetch(`/api/sprints/${sprint.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "迭代删除失败。");
      setNotice("迭代已删除");
      await loadSprints();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "迭代删除失败。",
      );
    }
  }

  return (
    <div className="module-page sprint-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">交付节奏管理</span>
          <h2>用短周期稳定推进交付</h2>
          <p>规划迭代目标、容量和任务范围，持续观察完成率与工时消耗。</p>
        </div>
        {canCreate && (
          <button className="primary-action module-primary" type="button" onClick={openCreate}>
            <Plus size={16} /> 新建迭代
          </button>
        )}
      </section>

      <section className="sprint-stat-grid">
        <article><span className="metric-icon blue"><CircleDot size={19} /></span><div><small>进行中</small><b>{stats.active}</b></div></article>
        <article><span className="metric-icon violet"><CalendarRange size={19} /></span><div><small>待启动</small><b>{stats.planned}</b></div></article>
        <article><span className="metric-icon green"><CheckCircle2 size={19} /></span><div><small>已完成</small><b>{stats.completed}</b></div></article>
        <article><span className="metric-icon orange"><Gauge size={19} /></span><div><small>当前总容量</small><b>{stats.capacity.toFixed(0)}h</b></div></article>
      </section>

      <section className="module-toolbar">
        <label className="module-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索迭代或项目" />
        </label>
        <label className="module-select">
          <select value={status} onChange={(event) => setStatus(event.target.value as "" | SprintStatus)}>
            <option value="">全部状态</option>
            {Object.entries(sprintStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <span className="toolbar-result">显示 {filtered.length} 个迭代</span>
      </section>

      {error && <div className="module-alert">{error}</div>}
      {loading ? (
        <div className="module-loading">正在加载迭代…</div>
      ) : filtered.length ? (
        <section className="sprint-list">
          {filtered.map((sprint) => {
            const capacityUsed = sprint.capacityHours
              ? Math.round((sprint.estimateHours / sprint.capacityHours) * 100)
              : 0;
            return (
              <article className="sprint-card" key={sprint.id}>
                <div className="sprint-accent" style={{ background: sprint.projectColor }} />
                <header>
                  <div>
                    <small><i style={{ background: sprint.projectColor }} /> {sprint.projectCode} · {sprint.projectName}</small>
                    <h3>{sprint.name}</h3>
                  </div>
                  <span className={`sprint-status sprint-${sprint.status}`}>{sprintStatusLabels[sprint.status]}</span>
                </header>
                <p>{sprint.goal || "尚未填写本次迭代目标。"}</p>
                <div className="sprint-dates">
                  <CalendarRange size={15} />
                  <span>{displayDate(sprint.startDate)} — {displayDate(sprint.endDate)}</span>
                </div>
                <div className="sprint-progress-row">
                  <div>
                    <header><span>任务完成</span><b>{sprint.completedTaskCount}/{sprint.taskCount} · {sprint.progress}%</b></header>
                    <div className="progress-track"><i style={{ width: `${sprint.progress}%`, background: sprint.projectColor }} /></div>
                  </div>
                  <div>
                    <header><span>容量占用</span><b className={capacityUsed > 100 ? "risk" : ""}>{capacityUsed}%</b></header>
                    <div className="progress-track"><i style={{ width: `${Math.min(100, capacityUsed)}%` }} /></div>
                  </div>
                </div>
                <div className="sprint-hours">
                  <span><small>容量</small><b>{sprint.capacityHours.toFixed(1)}h</b></span>
                  <span><small>预估</small><b>{sprint.estimateHours.toFixed(1)}h</b></span>
                  <span><small>实际</small><b>{sprint.actualHours.toFixed(1)}h</b></span>
                  <span><small>测试覆盖</small><b>{sprint.testedTaskCount}/{sprint.taskCount}</b></span>
                </div>
                {sprint.canManage && (
                  <footer>
                    {sprint.status !== "completed" ? (
                      <button type="button" onClick={() => void openPlanning(sprint)}><ClipboardList size={14} /> 规划任务</button>
                    ) : (
                      <span>历史快照已锁定</span>
                    )}
                    <div>
                      {sprint.status === "planned" && (
                        <>
                          <button type="button" disabled={transitioningId === sprint.id} onClick={() => void transitionSprint(sprint, "active")}><Play size={14} /> 启动</button>
                          <button type="button" onClick={() => openEdit(sprint)}><Edit3 size={14} /> 编辑</button>
                          <button type="button" onClick={() => void deleteSprint(sprint)} aria-label={`删除 ${sprint.name}`}><Trash2 size={14} /></button>
                        </>
                      )}
                      {sprint.status === "active" && (
                        <>
                          <button type="button" disabled={transitioningId === sprint.id} onClick={() => void transitionSprint(sprint, "completed")}><CheckCircle2 size={14} /> 完成</button>
                          <button type="button" onClick={() => openEdit(sprint)}><Edit3 size={14} /> 编辑</button>
                        </>
                      )}
                      {sprint.status === "completed" && (
                        <button type="button" disabled={transitioningId === sprint.id} onClick={() => void transitionSprint(sprint, "active")}><RotateCcw size={14} /> 重新打开</button>
                      )}
                    </div>
                  </footer>
                )}
              </article>
            );
          })}
        </section>
      ) : (
        <div className="module-empty large"><CalendarRange size={30} /><b>没有符合条件的迭代</b><span>创建迭代并规划任务范围。</span></div>
      )}

      {formOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="sprint-form-title">
            <header>
              <div><span className="eyebrow">{editingId ? "编辑迭代" : "新迭代"}</span><h2 id="sprint-form-title">{editingId ? "更新迭代计划" : "创建一个交付周期"}</h2></div>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="关闭"><X size={18} /></button>
            </header>
            <form onSubmit={saveSprint}>
              <div className="workspace-form-grid">
                <label><span>所属项目</span><select required value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}><option value="">请选择</option>{projects.filter((project) => project.canManage).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
                <label><span>迭代名称</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：Sprint 2026-08" /></label>
                <label><span>团队容量（小时）</span><input type="number" min="0" step="1" value={form.capacityHours} onChange={(e) => setForm({ ...form, capacityHours: Number(e.target.value) })} /></label>
                <label><span>开始日期</span><input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
                <label><span>结束日期</span><input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
                <label className="form-wide"><span>迭代目标</span><textarea rows={4} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="描述本次迭代必须达成的业务或交付结果。" /></label>
              </div>
              <footer><button type="button" onClick={() => setFormOpen(false)}>取消</button><button className="primary-action" type="submit" disabled={saving}>{saving ? "保存中…" : "保存迭代"}</button></footer>
            </form>
          </section>
        </div>
      )}

      {planningSprint && (
        <div className="modal-backdrop" role="presentation">
          <section className="workspace-modal sprint-planning-modal" role="dialog" aria-modal="true" aria-labelledby="planning-title">
            <header>
              <div><span className="eyebrow">迭代规划</span><h2 id="planning-title">{planningSprint.name}</h2></div>
              <button type="button" onClick={() => setPlanningSprint(null)} aria-label="关闭"><X size={18} /></button>
            </header>
            <div className="planning-summary">
              <span>已选择 {selectedTaskIds.length} 项</span>
              <b>{candidateTasks.filter((task) => selectedTaskIds.includes(task.id)).reduce((sum, task) => sum + task.estimateHours, 0).toFixed(1)}h / {planningSprint.capacityHours.toFixed(1)}h</b>
            </div>
            <div className="planning-task-list">
              {candidateTasks.map((task) => {
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
                      onChange={(event) => setSelectedTaskIds((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))}
                    />
                    <span>
                      <b>{task.title}</b>
                      <small>
                        {taskStatusLabels[task.status]} · 预估 {task.estimateHours.toFixed(1)}h · 测试 {task.testerName ?? "待指派"}
                        {belongsToOtherSprint ? ` · 已属于 ${task.sprintName ?? "其他迭代"}` : ""}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            <footer className="planning-footer"><button type="button" onClick={() => setPlanningSprint(null)}>取消</button><button className="primary-action" type="button" disabled={planningLoading} onClick={() => void savePlanning()}>{planningLoading ? "保存中…" : "保存任务范围"}</button></footer>
          </section>
        </div>
      )}

      {notice && <div className="toast"><CheckCircle2 size={16} /> {notice}</div>}
    </div>
  );
}
