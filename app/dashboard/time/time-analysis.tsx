"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Gauge,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Undo2,
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
  approvalStatus: "pending" | "approved" | "rejected";
  approvedByName: string | null;
  approvedAt: string | null;
  approvalComment: string;
  canDelete: boolean;
  canApprove: boolean;
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
 * 渲染工时筛选、趋势、明细和登记表单。
 *
 * @param initialTaskId 从任务看板或消息提醒带入的待登记任务 ID。
 * @return 工时分析组件。
 */
export default function TimeAnalysis({ initialTaskId = "" }: { initialTaskId?: string }) {
  const { confirm, prompt } = useDashboardDialog();
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
      if (!response.ok) throw new Error(result.error ?? "工时记录加载失败。");
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
        const targetTask = nextTasks.find((task) => task.id === initialTaskId);
        const targetProject = nextProjects.find(
          (project) => project.id === targetTask?.projectId && project.canLog,
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
          setError("指定任务不存在、不可补录，或当前账号不是指定开发人员。");
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
  const {
    page,
    pageSize,
    pageItems: paginatedLogs,
    setPage,
    changePageSize,
    resetPage,
  } = useClientPagination(visibleLogs);

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
  const projectPagination = useClientPagination(projects);

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
    const selectedTask = tasks.find((task) => task.projectId === selectedProjectId);
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
    const confirmed = await confirm({
      title: "删除工时记录",
      message: `确定删除任务“${log.taskTitle}”的这条 ${log.durationHours} 小时工时记录吗？`,
      confirmLabel: "删除记录",
      tone: "danger",
    });
    if (!confirmed) return;
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

  /**
   * 审核或退回项目成员提交的工时记录。
   *
   * @param log 待审核的工时记录。
   * @param approvalStatus 目标审核状态。
   * @return 审核完成后的 Promise。
   */
  async function reviewLog(
    log: WorkLogRecord,
    approvalStatus: "approved" | "rejected",
  ) {
    const approvalComment =
      approvalStatus === "rejected"
        ? await prompt({
            title: "退回工时记录",
            message: `请说明退回“${log.taskTitle}”这条工时的原因，成员可据此补充或修正。`,
            inputLabel: "退回原因",
            placeholder: "例如：工作说明不完整，请补充交付结果。",
            confirmLabel: "确认退回",
            tone: "danger",
          })
        : "";
    if (approvalStatus === "rejected" && !approvalComment?.trim()) return;
    if (approvalStatus === "approved") {
      const confirmed = await confirm({
        title: "通过工时审核",
        message: `确认通过“${log.taskTitle}”的 ${log.durationHours.toFixed(1)} 小时工时记录吗？`,
        confirmLabel: "通过审核",
      });
      if (!confirmed) return;
    }
    try {
      const response = await fetch(`/api/work-logs/${log.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus, approvalComment }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "工时审核失败。");
      setNotice(approvalStatus === "approved" ? "工时已通过审核" : "工时已退回补充");
      await loadLogs();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "工时审核失败。");
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
        <label className="module-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="搜索任务、说明或成员" /></label>
        <label className="module-select"><select value={projectId} onChange={(event) => { setProjectId(event.target.value); resetPage(); }}><option value="">全部项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}{project.archived ? "（已归档）" : ""}</option>)}</select></label>
        <label className="module-select"><select value={userId} onChange={(event) => { setUserId(event.target.value); resetPage(); }}><option value="">全部成员</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {roleLabels[user.role]}{user.active ? "" : "（已停用）"}</option>)}</select></label>
        <label className="date-control"><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); resetPage(); }} /><span>至</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); resetPage(); }} /></label>
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
            {projectPagination.pageItems.map((project) => {
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
          {projects.length > 0 && (
            <PaginationControls
              page={projectPagination.page}
              pageSize={projectPagination.pageSize}
              total={projects.length}
              itemLabel="个项目"
              onPageChange={projectPagination.setPage}
              onPageSizeChange={projectPagination.changePageSize}
            />
          )}
        </article>
      </section>

      <section className="module-card work-log-table-card">
        <header className="module-card-header"><div><span className="eyebrow">明细记录</span><h3>工时流水</h3></div><span className="header-count">{visibleLogs.length} 条</span></header>
        {loading ? <div className="module-loading">正在加载工时记录…</div> : visibleLogs.length ? (
          <div className="work-log-table-wrap">
            <table className="work-log-table">
              <thead><tr><th>日期</th><th>工作内容</th><th>成员</th><th>工时</th><th>审核</th><th /></tr></thead>
              <tbody>{paginatedLogs.map((log) => (
                <tr key={log.id}>
                  <td><span className="work-log-date"><CalendarDays size={14} /> {log.workDate.slice(0, 10)}</span></td>
                  <td>
                    <div className="work-log-content">
                      <span><i style={{ background: log.projectColor }} /> {log.projectCode} · {log.projectName}</span>
                      <b>{log.taskTitle}</b>
                      {log.note && <small>{log.note}</small>}
                    </div>
                  </td>
                  <td>
                    <div className="work-log-member">
                      <span className="avatar">{log.userName.slice(0, 1)}</span>
                      <span><b>{log.userName}</b><small>{roleLabels[log.userRole]}</small></span>
                    </div>
                  </td>
                  <td><strong className="work-log-hours">{log.durationHours.toFixed(1)}h</strong></td>
                  <td>
                    <span
                      className={`work-log-approval approval-${log.approvalStatus}`}
                      title={
                        log.approvalComment ||
                        (log.approvedByName ? `审核人：${log.approvedByName}` : "等待项目负责人审核")
                      }
                    >
                      {log.approvalStatus === "pending"
                        ? "待审核"
                        : log.approvalStatus === "approved"
                          ? "已通过"
                          : "已退回"}
                    </span>
                  </td>
                  <td>
                    <div className="work-log-actions">
                      {log.canApprove && log.approvalStatus !== "approved" && (
                        <button
                          type="button"
                          onClick={() => void reviewLog(log, "approved")}
                          aria-label={`通过 ${log.taskTitle} 的工时审核`}
                          title="通过审核"
                        >
                          <Check size={14} />
                        </button>
                      )}
                      {log.canApprove && log.approvalStatus !== "rejected" && (
                        <button
                          type="button"
                          onClick={() => void reviewLog(log, "rejected")}
                          aria-label={`退回 ${log.taskTitle} 的工时记录`}
                          title="退回补充"
                        >
                          <Undo2 size={14} />
                        </button>
                      )}
                      {log.canDelete && <button type="button" onClick={() => void deleteLog(log)} aria-label={`删除 ${log.taskTitle} 的工时记录`} title="删除工时"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="module-empty"><Clock3 size={25} /> 当前筛选范围暂无工时记录</div>}
        {!loading && visibleLogs.length > 0 && (
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={visibleLogs.length}
            itemLabel="条工时"
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
          />
        )}
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="work-log-title">
            <header><div><span className="eyebrow">登记工时</span><h2 id="work-log-title">记录实际投入</h2></div><button type="button" onClick={() => setModalOpen(false)} aria-label="关闭"><X size={18} /></button></header>
            <form onSubmit={saveLog}>
              <div className="workspace-form-grid">
                <label><span>项目</span><select required value={form.projectId} onChange={(e) => { const nextProjectId = e.target.value; setForm({ ...form, projectId: nextProjectId, taskId: tasks.find((task) => task.projectId === nextProjectId)?.id ?? "" }); }}><option value="">请选择</option>{projects.filter((project) => project.canLog).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
                <label><span>任务（仅显示由我负责的任务）</span><select required value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}><option value="">请选择</option>{tasks.filter((task) => task.projectId === form.projectId).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
                <label><span>工作日期</span><input required type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} /></label>
                <label><span>实际工时（小时）</span><input required type="number" min="0.1" max="24" step="0.1" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) })} /></label>
                <label className="form-wide"><span>工作说明</span><textarea rows={4} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="简要说明完成了什么、遇到什么问题。" /></label>
              </div>
              <div className="time-form-hint"><UserRound size={15} /><span>实际工时仅允许该任务当前指定的开发负责人本人登记。</span></div>
              <footer><button type="button" onClick={() => setModalOpen(false)}>取消</button><button className="primary-action" type="submit" disabled={saving}>{saving ? "保存中…" : "保存工时"}</button></footer>
            </form>
          </section>
        </div>
      )}
      {notice && <div className="toast"><CheckCircle2 size={16} /> {notice}</div>}
    </div>
  );
}
