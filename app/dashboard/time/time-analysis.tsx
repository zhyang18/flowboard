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
import { roleLabels } from "@/lib/users";

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
  canManage: boolean;
};
type UserOption = {
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
  projectIds: string[];
};
type TaskOption = { id: string; title: string; projectId: string; testerId: string | null };
type WorkLogForm = {
  projectId: string;
  taskId: string;
  userId: string;
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
 * 为工时表单选择项目内有效成员，兼容未直接加入项目的超级管理员代填场景。
 *
 * @param users 当前可见的成员选项。
 * @param projectId 工时所属项目 ID。
 * @param currentUserId 当前登录用户 ID。
 * @param preferredUserId 筛选器或表单中优先保留的成员 ID。
 * @param canManage 当前用户是否可以代项目成员登记工时。
 * @return 可提交的成员 ID；项目没有有效成员时返回空字符串。
 */
function defaultLogUserId(
  users: UserOption[],
  projectId: string,
  currentUserId: string,
  preferredUserId: string,
  canManage: boolean,
): string {
  const candidates = users.filter(
    (user) => user.active && user.projectIds.includes(projectId),
  );
  if (canManage) {
    return (
      candidates.find((user) => user.id === preferredUserId)?.id ??
      candidates.find((user) => user.id === currentUserId)?.id ??
      candidates[0]?.id ??
      ""
    );
  }
  return candidates.find((user) => user.id === currentUserId)?.id ?? "";
}

/**
 * 渲染工时筛选、趋势、明细和登记表单。
 *
 * @param initialTaskId 从任务看板或消息提醒带入的待登记任务 ID。
 * @return 工时分析组件。
 */
export default function TimeAnalysis({ initialTaskId = "" }: { initialTaskId?: string }) {
  const [logs, setLogs] = useState<WorkLogRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
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
    userId: "",
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
        currentUserId?: string;
        canCreate?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "工时记录加载失败。");
      const nextProjects = result.projects ?? [];
      const nextUsers = result.users ?? [];
      const nextTasks = result.tasks ?? [];
      const nextCurrentUserId = result.currentUserId ?? "";
      setLogs(result.data ?? []);
      setProjects(nextProjects);
      setUsers(nextUsers);
      setTasks(nextTasks);
      setCurrentUserId(nextCurrentUserId);
      setCanCreate(Boolean(result.canCreate));
      if (initialTaskId && !initialTaskHandled.current) {
        initialTaskHandled.current = true;
        const targetTask = nextTasks.find((task) => task.id === initialTaskId);
        const targetProject = nextProjects.find(
          (project) => project.id === targetTask?.projectId && project.canLog,
        );
        if (targetTask && targetProject) {
          const nextUserId = defaultLogUserId(
            nextUsers,
            targetProject.id,
            nextCurrentUserId,
            userId,
            targetProject.canManage,
          );
          const nextUser = nextUsers.find((user) => user.id === nextUserId);
          if (nextUser && (nextUser.role !== "tester" || targetTask.testerId === nextUserId)) {
            setForm({
              projectId: targetProject.id,
              taskId: targetTask.id,
              userId: nextUserId,
              workDate: initialTo,
              durationHours: 1,
              note: "",
            });
            setModalOpen(true);
          } else {
            setError("当前账号不能为该任务登记工时。");
          }
        } else {
          setError("指定任务不存在、已归档或所属迭代已经完成。");
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "工时记录加载失败。",
      );
    } finally {
      setLoading(false);
    }
  }, [from, initialTaskId, projectId, to, userId]);

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

  const metrics = useMemo(() => {
    const total = visibleLogs.reduce((sum, log) => sum + log.durationHours, 0);
    const people = new Set(visibleLogs.map((log) => log.userId)).size;
    const days = new Set(visibleLogs.map((log) => log.workDate.slice(0, 10))).size;
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

  /**
   * 在当前用户可登记的项目中打开工时表单。
   *
   * @return 无返回值。
   */
  function openCreate() {
    const writableProject =
      projects.find((project) => project.id === projectId && project.canLog) ??
      projects.find((project) => project.canLog);
    const selectedProjectId = writableProject?.id ?? "";
    const selectedUserId = defaultLogUserId(
      users,
      selectedProjectId,
      currentUserId,
      userId,
      Boolean(writableProject?.canManage),
    );
    const selectedUser = users.find((user) => user.id === selectedUserId);
    const selectedTask = tasks.find(
      (task) =>
        task.projectId === selectedProjectId &&
        (selectedUser?.role !== "tester" || task.testerId === selectedUserId),
    );
    setForm({
      projectId: selectedProjectId,
      taskId: selectedTask?.id ?? "",
      userId: selectedUserId,
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
      if (!response.ok) throw new Error(result.error ?? "工时登记失败。");
      setModalOpen(false);
      setNotice("工时已登记并同步到任务");
      await loadLogs();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "工时登记失败。");
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
    if (!window.confirm(`确定删除这条 ${log.durationHours} 小时的记录吗？`)) return;
    try {
      const response = await fetch(`/api/work-logs/${log.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "工时记录删除失败。");
      setNotice("工时记录已删除");
      await loadLogs();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "工时记录删除失败。",
      );
    }
  }

  return (
    <div className="module-page time-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">投入与产出</span>
          <h2>看清时间花在哪里</h2>
          <p>按项目、成员和日期分析实际投入，每条记录自动累加到任务工时。</p>
        </div>
        {canCreate && (
          <button className="primary-action module-primary" type="button" onClick={openCreate}>
            <Plus size={16} /> 登记工时
          </button>
        )}
      </section>

      <section className="time-stat-grid">
        <article><span className="metric-icon blue"><Clock3 size={19} /></span><div><small>总登记工时</small><b>{metrics.total.toFixed(1)}h</b></div></article>
        <article><span className="metric-icon green"><TrendingUp size={19} /></span><div><small>日均投入</small><b>{metrics.average.toFixed(1)}h</b></div></article>
        <article><span className="metric-icon violet"><UserRound size={19} /></span><div><small>参与成员</small><b>{metrics.people}</b></div></article>
        <article><span className="metric-icon orange"><Gauge size={19} /></span><div><small>工时条目</small><b>{metrics.entries}</b></div></article>
      </section>

      <section className="module-toolbar time-toolbar">
        <label className="module-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、说明或成员" /></label>
        <label className="module-select"><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">全部项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}{project.archived ? "（已归档）" : ""}</option>)}</select></label>
        <label className="module-select"><select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">全部成员</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {roleLabels[user.role]}{user.active ? "" : "（已停用）"}</option>)}</select></label>
        <label className="date-control"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><span>至</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </section>

      {error && <div className="module-alert">{error}</div>}
      <section className="time-grid">
        <article className="module-card time-chart-card">
          <header className="module-card-header"><div><span className="eyebrow">最近 7 天</span><h3>每日投入趋势</h3></div><span className="header-count">目标 8h / 人日</span></header>
          <div className="time-bar-chart">
            {daily.map((item) => (
              <div key={item.date}>
                <span><i style={{ height: `${Math.max(4, (item.hours / dailyMax) * 100)}%` }} /></span>
                <b>{item.hours.toFixed(1)}h</b>
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="module-card time-breakdown">
          <header className="module-card-header"><div><span className="eyebrow">项目分布</span><h3>工时去向</h3></div></header>
          <div>
            {projects.map((project) => {
              const hours = visibleLogs.filter((log) => log.projectId === project.id).reduce((sum, log) => sum + log.durationHours, 0);
              const share = metrics.total ? Math.round((hours / metrics.total) * 100) : 0;
              return (
                <div className="time-project-row" key={project.id}>
                  <span className="project-mark" style={{ background: project.color }}>{project.code.slice(0, 2)}</span>
                  <div><header><b>{project.name}{project.archived ? "（已归档）" : ""}</b><span>{hours.toFixed(1)}h · {share}%</span></header><div className="progress-track"><i style={{ width: `${share}%`, background: project.color }} /></div></div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="module-card work-log-table-card">
        <header className="module-card-header"><div><span className="eyebrow">明细记录</span><h3>工时流水</h3></div><span className="header-count">{visibleLogs.length} 条</span></header>
        {loading ? <div className="module-loading">正在加载工时记录…</div> : visibleLogs.length ? (
          <div className="work-log-table-wrap">
            <table className="work-log-table">
              <thead><tr><th>日期</th><th>成员</th><th>项目 / 任务</th><th>说明</th><th>工时</th><th /></tr></thead>
              <tbody>{visibleLogs.map((log) => (
                <tr key={log.id}>
                  <td><CalendarDays size={13} /> {log.workDate.slice(0, 10)}</td>
                  <td><span className="avatar">{log.userName.slice(0, 1)}</span>{log.userName} · {roleLabels[log.userRole]}</td>
                  <td><small><i style={{ background: log.projectColor }} /> {log.projectCode}</small><b>{log.taskTitle}</b></td>
                  <td>{log.note || "—"}</td>
                  <td><strong>{log.durationHours.toFixed(1)}h</strong></td>
                  <td>{log.canDelete && <button type="button" onClick={() => void deleteLog(log)} aria-label={`删除 ${log.taskTitle} 的工时记录`}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="module-empty"><Clock3 size={25} /> 当前筛选范围暂无工时记录</div>}
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="work-log-title">
            <header><div><span className="eyebrow">登记工时</span><h2 id="work-log-title">记录实际投入</h2></div><button type="button" onClick={() => setModalOpen(false)} aria-label="关闭"><X size={18} /></button></header>
            <form onSubmit={saveLog}>
              <div className="workspace-form-grid">
                <label><span>项目</span><select required value={form.projectId} onChange={(e) => { const nextProjectId = e.target.value; const nextProject = projects.find((project) => project.id === nextProjectId); const nextUserId = defaultLogUserId(users, nextProjectId, currentUserId, form.userId, Boolean(nextProject?.canManage)); const nextUser = users.find((user) => user.id === nextUserId); setForm({ ...form, projectId: nextProjectId, taskId: tasks.find((task) => task.projectId === nextProjectId && (nextUser?.role !== "tester" || task.testerId === nextUserId))?.id ?? "", userId: nextUserId }); }}><option value="">请选择</option>{projects.filter((project) => project.canLog).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
                <label><span>任务</span><select required value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}><option value="">请选择</option>{tasks.filter((task) => task.projectId === form.projectId && (users.find((user) => user.id === form.userId)?.role !== "tester" || task.testerId === form.userId)).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
                {projects.find((project) => project.id === form.projectId)?.canManage && <label><span>成员</span><select required value={form.userId} onChange={(e) => { const nextUserId = e.target.value; setForm({ ...form, userId: nextUserId, taskId: tasks.some((task) => task.id === form.taskId && (users.find((user) => user.id === nextUserId)?.role !== "tester" || task.testerId === nextUserId)) ? form.taskId : "" }); }}>{users.filter((user) => user.active && user.projectIds.includes(form.projectId)).map((user) => <option key={user.id} value={user.id}>{user.name} · {roleLabels[user.role]}</option>)}</select></label>}
                <label><span>工作日期</span><input required type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} /></label>
                <label><span>实际工时（小时）</span><input required type="number" min="0.1" max="24" step="0.5" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) })} /></label>
                <label className="form-wide"><span>工作说明</span><textarea rows={4} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="简要说明完成了什么、遇到什么问题。" /></label>
              </div>
              <footer><button type="button" onClick={() => setModalOpen(false)}>取消</button><button className="primary-action" type="submit" disabled={saving}>{saving ? "保存中…" : "保存工时"}</button></footer>
            </form>
          </section>
        </div>
      )}
      {notice && <div className="toast"><CheckCircle2 size={16} /> {notice}</div>}
    </div>
  );
}
