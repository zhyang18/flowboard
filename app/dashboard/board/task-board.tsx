"use client";

import {
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  Edit3,
  GripVertical,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import type { SprintStatus, TaskPriority, TaskStatus, UserRole } from "@/db/schema";
import {
  sprintStatusLabels,
  taskPriorityLabels,
  taskStatusLabels,
  taskStatuses,
} from "@/lib/workspace";
import AttachmentEditor from "../attachment-editor";
import { useDashboardDialog } from "../dashboard-dialog-provider";
import AttachmentViewer from "../attachment-viewer";
import PaginationControls, { useClientPagination } from "../pagination-controls";
import RichTextContent from "../rich-text-content";
import ViewModeToggle, { usePersistentViewMode } from "../view-mode-toggle";

type BoardTask = {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  projectColor: string;
  sprintId: string | null;
  sprintName: string | null;
  sprintStatus: SprintStatus | null;
  attachmentCount: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  testerId: string | null;
  testerName: string | null;
  estimateHours: number;
  actualHours: number;
  sortOrder: number;
  dueDate: string | null;
  completedAt: string | null;
  canEdit: boolean;
  canChangeStatus: boolean;
  canDelete: boolean;
  canManageProject: boolean;
  canLogWork: boolean;
  canReject: boolean;
  latestRejection: {
    id: string;
    reason: string;
    testerName: string;
    createdAt: string;
  } | null;
  overdue: boolean;
};

type ProjectOption = {
  id: string;
  name: string;
  code: string;
  color: string;
  canCreateTask: boolean;
  canManage: boolean;
};
type AssigneeOption = { id: string; name: string; projectIds: string[] };
type TesterOption = { id: string; name: string; projectIds: string[] };
type SprintOption = {
  id: string;
  projectId: string;
  name: string;
  status: SprintStatus;
};

type TaskForm = {
  projectId: string;
  sprintId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  testerId: string;
  estimateHours: number;
  dueDate: string;
};

type WorkLogForm = {
  workDate: string;
  durationHours: number;
  note: string;
}

type WorkLogRecord = {
  id: string;
  durationHours: number;
  workDate: string;
  note: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
  };
};

/**
 * 突出展示任务所属项目、迭代名称和迭代状态。
 *
 * @param task 包含项目与迭代归属信息的任务。
 * @param compact 是否使用列表视图的紧凑布局。
 * @return 任务项目和迭代归属信息块。
 */
function TaskContext({ task, compact = false }: { task: BoardTask; compact?: boolean }) {
  const sprintState = task.sprintStatus ?? "unplanned";
  return (
    <div className={`task-context${compact ? " compact" : ""}`}>
      <div
        className="task-project-context"
        style={{ borderLeftColor: task.projectColor }}
        title={`所属项目：${task.projectCode} · ${task.projectName}`}
      >
        <span className="task-project-code">{task.projectCode}</span>
        <span>
          <small>所属项目</small>
          <strong>{task.projectName}</strong>
        </span>
      </div>
      <div
        className={`task-sprint-context sprint-${sprintState}`}
        title={`所属迭代：${task.sprintName ?? "未规划迭代"}`}
      >
        <CalendarRange size={15} />
        <span>
          <small>所属迭代</small>
          <strong>{task.sprintName ?? "未规划迭代"}</strong>
        </span>
        <em>{task.sprintStatus ? sprintStatusLabels[task.sprintStatus] : "待规划"}</em>
      </div>
    </div>
  );
}

const emptyForm: TaskForm = {
  projectId: "",
  sprintId: "",
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  assigneeId: "",
  testerId: "",
  estimateHours: 4,
  dueDate: "",
};

/**
 * 创建任务看板工时登记表单的默认值。
 *
 * @return 默认使用今天和一小时投入的工时表单。
 */
function createWorkLogForm(): WorkLogForm {
  return {
    workDate: new Date().toISOString().slice(0, 10),
    durationHours: 1,
    note: "",
  };
}

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
 * 格式化任务截止日期。
 *
 * @param value ISO 日期或空值。
 * @return 简短日期文本。
 */
function dateLabel(value: string | null) {
  if (!value) return "未排期";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/**
 * 格式化任务实际完成时间。
 *
 * @param value ISO 完成时间或空值。
 * @return 日期时间文本。
 */
function completedLabel(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * 渲染按项目权限过滤的任务看板。
 *
 * @param initialTaskId 从消息提醒带入并需要聚焦的任务 ID。
 * @return 任务看板组件。
 */
export default function TaskBoard({ initialTaskId = "" }: { initialTaskId?: string }) {
  const { confirm } = useDashboardDialog();
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [testers, setTesters] = useState<TesterOption[]>([]);
  const [sprints, setSprints] = useState<SprintOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>("member");
  const [canCreate, setCanCreate] = useState(false);
  const [defaultEstimateHours, setDefaultEstimateHours] = useState(4);
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [testerId, setTesterId] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = usePersistentViewMode(
    "flowboard:tasks:view-mode",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<TaskStatus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [attachmentDraftToken, setAttachmentDraftToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [rejectingTask, setRejectingTask] = useState<BoardTask | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionDraftToken, setRejectionDraftToken] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [loggingTask, setLoggingTask] = useState<BoardTask | null>(null);
  const [workLogForm, setWorkLogForm] = useState<WorkLogForm>(createWorkLogForm);
  const [loggingWork, setLoggingWork] = useState(false);
  const [workLogs, setWorkLogs] = useState<WorkLogRecord[]>([]);
  const [loadingWorkLogs, setLoadingWorkLogs] = useState(false);

  /**
   * 按当前筛选条件加载任务以及可选的开发和测试负责人。
   *
   * @return 加载完成后的 Promise。
   */
  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (testerId) params.set("testerId", testerId);
    if (sprintId) params.set("sprintId", sprintId);
    if (initialTaskId) params.set("taskId", initialTaskId);
    if (query.trim()) params.set("query", query.trim());
    try {
      const response = await fetch(`/api/tasks?${params}`, { cache: "no-store" });
      const result = (await response.json()) as {
        data?: BoardTask[];
        projects?: ProjectOption[];
        assignees?: AssigneeOption[];
        testers?: TesterOption[];
        sprints?: SprintOption[];
        currentUserId?: string;
        currentUserRole?: UserRole;
        canCreate?: boolean;
        defaultEstimateHours?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "任务加载失败。");
      setTasks(result.data ?? []);
      setProjects(result.projects ?? []);
      setAssignees(result.assignees ?? []);
      setTesters(result.testers ?? []);
      setSprints(result.sprints ?? []);
      setCurrentUserId(result.currentUserId ?? "");
      setCurrentUserRole(result.currentUserRole ?? "member");
      setCanCreate(Boolean(result.canCreate));
      setDefaultEstimateHours(result.defaultEstimateHours ?? 4);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "任务加载失败。");
    } finally {
      setLoading(false);
    }
  }, [assigneeId, initialTaskId, projectId, query, sprintId, testerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTasks(), query ? 240 : 0);
    return () => window.clearTimeout(timer);
  }, [loadTasks, query]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!initialTaskId || loading || !tasks.some((task) => task.id === initialTaskId)) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`task-${initialTaskId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialTaskId, loading, tasks]);

  const metrics = useMemo(() => {
    const estimate = tasks.reduce((sum, task) => sum + task.estimateHours, 0);
    const actual = tasks.reduce((sum, task) => sum + task.actualHours, 0);
    const overdue = tasks.filter((task) => task.overdue).length;
    return { estimate, actual, overdue };
  }, [tasks]);
  const {
    page,
    pageSize,
    pageItems: paginatedTasks,
    setPage,
    changePageSize,
    resetPage,
  } = useClientPagination(tasks);

  /**
   * 在可写项目中打开新建任务表单。
   *
   * @param status 默认任务状态。
   * @return 无返回值。
   */
  function openCreate(status: TaskStatus = "todo") {
    const writableProject =
      projects.find((project) => project.id === projectId && project.canCreateTask) ??
      projects.find((project) => project.canCreateTask);
    const selectedAssignee = assignees.find(
      (assignee) =>
        assignee.id === assigneeId &&
        writableProject &&
        assignee.projectIds.includes(writableProject.id),
    );
    const currentUserAssignee = assignees.find(
      (assignee) =>
        assignee.id === currentUserId &&
        writableProject &&
        assignee.projectIds.includes(writableProject.id),
    );
    setEditingId(null);
    setAttachmentDraftToken(crypto.randomUUID());
    setForm({
      ...emptyForm,
      status,
      estimateHours: defaultEstimateHours,
      projectId: writableProject?.id ?? "",
      assigneeId: writableProject?.canManage
        ? selectedAssignee?.id ?? ""
        : currentUserAssignee?.id ?? "",
      testerId:
        currentUserRole === "tester" &&
        testers.some(
          (tester) =>
            tester.id === currentUserId &&
            writableProject &&
            tester.projectIds.includes(writableProject.id),
        )
          ? currentUserId
          : testers.find(
          (tester) =>
            tester.id === testerId &&
            writableProject &&
            tester.projectIds.includes(writableProject.id),
          )?.id ?? "",
    });
    setModalOpen(true);
  }

  /**
   * 使用现有任务数据打开编辑表单。
   *
   * @param task 待编辑任务。
   * @return 无返回值。
   */
  function openEdit(task: BoardTask) {
    setEditingId(task.id);
    setAttachmentDraftToken(crypto.randomUUID());
    setForm({
      projectId: task.projectId,
      sprintId: task.sprintId ?? "",
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId ?? "",
      testerId: task.testerId ?? "",
      estimateHours: task.estimateHours,
      dueDate: dateInput(task.dueDate),
    });
    setModalOpen(true);
  }

  /**
   * 创建或更新任务资料。
   *
   * @param event 任务表单提交事件。
   * @return 保存完成后的 Promise。
   */
  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const editingTask = tasks.find((task) => task.id === editingId);
      const payload =
        editingTask && currentUserRole === "tester" && !editingTask.canManageProject
          ? { status: form.status }
          : { ...form, attachmentDraftToken };
      const response = await fetch(editingId ? `/api/tasks/${editingId}` : "/api/tasks", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "任务保存失败。");
      setModalOpen(false);
      setNotice(editingId ? "任务已更新" : "任务已创建");
      await loadTasks();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "任务保存失败。");
    } finally {
      setSaving(false);
    }
  }

  /**
   * 更新任务看板状态并在失败时回滚界面。
   *
   * @param taskId 任务 ID。
   * @param status 目标状态。
   * @return 更新完成后的 Promise。
   */
  async function updateStatus(taskId: string, status: TaskStatus) {
    const targetTask = tasks.find((task) => task.id === taskId);
    if (!targetTask?.canChangeStatus || targetTask.status === status) return;
    const previous = tasks;
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              completedAt:
                status === "done"
                  ? task.completedAt ?? new Date().toISOString()
                  : null,
            }
          : task,
      ),
    );
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "状态更新失败。");
      setNotice(`任务已移至“${taskStatusLabels[status]}”`);
      await loadTasks();
    } catch (updateError) {
      setTasks(previous);
      setError(
        updateError instanceof Error ? updateError.message : "状态更新失败。",
      );
    }
  }

  /**
   * 处理任务拖放到目标状态列。
   *
   * @param event 拖放事件。
   * @param status 目标状态。
   * @return 无返回值。
   */
  function onDrop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/task-id") || draggedId;
    setDraggedId(null);
    setDropStatus(null);
    const task = tasks.find((item) => item.id === taskId);
    if (task?.canChangeStatus && task.status !== status) void updateStatus(task.id, status);
  }

  /**
   * 确认后删除没有工时历史的任务。
   *
   * @param task 待删除任务。
   * @return 删除完成后的 Promise。
   */
  async function deleteTask(task: BoardTask) {
    const confirmed = await confirm({
      title: "删除任务",
      message: `确定删除任务“${task.title}”吗？此操作无法撤销。`,
      confirmLabel: "删除任务",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "删除失败。");
      setNotice("任务已删除");
      await loadTasks();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败。");
    }
  }

  /**
   * 打开测试不通过表单并初始化独立附件草稿。
   *
   * @param task 待测试打回的任务。
   * @return 无返回值。
   */
  function openReject(task: BoardTask): void {
    setRejectingTask(task);
    setRejectionReason("");
    setRejectionDraftToken(crypto.randomUUID());
    setError("");
  }

  /**
   * 提交测试不通过原因、认领附件并将任务退回开发中。
   *
   * @param event 测试打回表单提交事件。
   * @return 提交流程完成后的 Promise。
   */
  async function rejectTask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!rejectingTask) return;
    setRejecting(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${rejectingTask.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: rejectionReason,
          attachmentDraftToken: rejectionDraftToken,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "任务打回失败。");
      setRejectingTask(null);
      setNotice("测试结果已记录，任务已退回开发中并通知开发负责人");
      await loadTasks();
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "任务打回失败。");
    } finally {
      setRejecting(false);
    }
  }

  async function loadWorkLogs(taskId: string) {
    setLoadingWorkLogs(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/work-logs`);
      const result = await response.json();
      if (response.ok) {
        setWorkLogs(result.data || []);
      }
    } catch (e) {
      console.error("加载历史工时失败", e);
    } finally {
      setLoadingWorkLogs(false);
    }
  }

  /**
   * 在任务看板内打开指定任务的工时登记表单。
   *
   * @param task 待登记实际工时的任务。
   * @return 无返回值。
   */
  function openWorkLog(task: BoardTask) {
    setLoggingTask(task);
    setWorkLogForm(createWorkLogForm());
    setError("");
    loadWorkLogs(task.id);
  }

  /**
   * 保存任务实际工时并刷新当前看板数据。
   *
   * @param event 工时登记表单提交事件。
   * @return 保存完成后的 Promise。
   */
  async function saveWorkLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loggingTask) return;
    setLoggingWork(true);
    setError("");
    try {
      const response = await fetch("/api/work-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: loggingTask.id, ...workLogForm }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "工时登记失败。");
      setLoggingTask(null);
      setNotice("工时已登记并同步到任务");
      await loadTasks();
    } catch (workLogError) {
      setError(
        workLogError instanceof Error ? workLogError.message : "工时登记失败。",
      );
    } finally {
      setLoggingWork(false);
    }
  }

  async function deleteWorkLog(logId: string) {
    if (!window.confirm("确定要删除这条工时记录吗？对应的任务实际工时也会扣减。")) return;
    try {
      const res = await fetch(`/api/work-logs/${logId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "删除失败");
      }
      setNotice("工时记录已删除");
      if (loggingTask) loadWorkLogs(loggingTask.id);
      await loadTasks();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "删除失败");
    }
  }

  const editingTask = tasks.find((task) => task.id === editingId);
  const testerStatusOnly = Boolean(
    editingTask && currentUserRole === "tester" && !editingTask.canManageProject,
  );
  const formProject = projects.find((project) => project.id === form.projectId);

  return (
    <div className="module-page board-page">
      <section className="module-heading board-heading">
        <div>
          <span className="eyebrow">任务执行中心</span>
          <h2>从需求进入到按时完成</h2>
          <p>拖动任务完成流转，持续核对预估工时、实际投入与完成时间。</p>
        </div>
        {canCreate && (
          <button className="primary-action module-primary" type="button" onClick={() => openCreate()}>
            <Plus size={16} /> 新建任务
          </button>
        )}
      </section>

      <section className="board-summary">
        <div><small>任务总数</small><b>{tasks.length}</b></div>
        <div><small>预估工时</small><b>{metrics.estimate.toFixed(1)}h</b></div>
        <div><small>实际投入</small><b>{metrics.actual.toFixed(1)}h</b></div>
        <div className={metrics.overdue ? "risk" : ""}><small>已逾期</small><b>{metrics.overdue}</b></div>
      </section>

      <section className="module-toolbar board-toolbar">
        <label className="module-search">
          <Search size={16} />
          <input value={query} onChange={(event) => {
            setQuery(event.target.value);
            resetPage();
          }} placeholder="搜索任务标题或描述" />
        </label>
        <label className="module-select">
          <span className="select-color" style={{ background: projects.find((project) => project.id === projectId)?.color ?? "#9aa6b2" }} />
          <select value={projectId} onChange={(event) => {
            setProjectId(event.target.value);
            setSprintId("");
            resetPage();
          }}>
            <option value="">全部项目</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="module-select">
          <CalendarRange size={14} />
          <select value={sprintId} onChange={(event) => {
            setSprintId(event.target.value);
            resetPage();
          }}>
            <option value="">全部迭代</option>
            <option value="unplanned">未规划</option>
            {sprints
              .filter((sprint) => !projectId || sprint.projectId === projectId)
              .map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {projects.find((project) => project.id === sprint.projectId)?.code} · {sprint.name}
                </option>
              ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="module-select">
          <UserRound size={14} />
          <select value={assigneeId} onChange={(event) => {
            setAssigneeId(event.target.value);
            resetPage();
          }}>
            <option value="">全部开发负责人</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="module-select">
          <ShieldCheck size={14} />
          <select value={testerId} onChange={(event) => {
            setTesterId(event.target.value);
            resetPage();
          }}>
            <option value="">全部测试负责人</option>
            {testers.map((tester) => <option key={tester.id} value={tester.id}>{tester.name}</option>)}
          </select>
          <ChevronDown size={14} />
        </label>
        <div className="toolbar-view-options">
          <span className="toolbar-result">显示 {tasks.length} 项任务</span>
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            cardLabel="切换为任务看板布局"
            listLabel="切换为任务列表布局"
          />
        </div>
      </section>

      {error && <div className="module-alert">{error}</div>}

      {loading ? (
        <div className="module-loading">正在加载任务看板…</div>
      ) : viewMode === "card" ? (
        <section className="kanban-scroll" aria-label="任务看板">
          <div className="kanban-board">
            {taskStatuses.map((status) => {
              const allColumnTasks = tasks.filter((task) => task.status === status);
              const columnTasks = paginatedTasks.filter((task) => task.status === status);
              const columnEstimate = allColumnTasks.reduce((sum, task) => sum + task.estimateHours, 0);
              return (
                <section
                  className={`kanban-column column-${status} ${dropStatus === status ? "drop-target" : ""}`}
                  key={status}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropStatus(status);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setDropStatus(null);
                    }
                  }}
                  onDrop={(event) => onDrop(event, status)}
                >
                  <header className="kanban-column-header">
                    <div>
                      <i />
                      <b>{taskStatusLabels[status]}</b>
                      <span>{allColumnTasks.length}</span>
                    </div>
                    <small>{columnEstimate.toFixed(1)}h</small>
                  </header>
                  <div className="kanban-task-list">
                    {columnTasks.map((task) => {
                      const remaining = task.estimateHours - task.actualHours;
                      const overrun = task.estimateHours > 0 && remaining < 0;
                      const overdue = task.overdue;
                      return (
                        <article
                          className={`kanban-task ${draggedId === task.id ? "dragging" : ""} ${initialTaskId === task.id ? "deep-linked" : ""}`}
                          id={`task-${task.id}`}
                          key={task.id}
                          draggable={task.canChangeStatus}
                          onDragStart={(event) => {
                            setDraggedId(task.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/task-id", task.id);
                          }}
                          onDragEnd={() => {
                            setDraggedId(null);
                            setDropStatus(null);
                          }}
                        >
                          <header>
                            <span className={`task-priority priority-${task.priority}`}>
                              {taskPriorityLabels[task.priority]}
                            </span>
                            {(task.canEdit || task.canChangeStatus || task.canReject || task.canDelete) && (
                              <div className="task-card-actions">
                                {task.canEdit && <button type="button" onClick={() => openEdit(task)} aria-label={`编辑 ${task.title}`}><Edit3 size={13} /></button>}
                                {task.canReject && <button type="button" onClick={() => openReject(task)} aria-label={`测试打回 ${task.title}`}><Undo2 size={13} /></button>}
                                {task.canDelete && <button type="button" onClick={() => deleteTask(task)} aria-label={`删除 ${task.title}`}><Trash2 size={13} /></button>}
                                {task.canChangeStatus && <GripVertical size={14} />}
                              </div>
                            )}
                          </header>
                          <TaskContext task={task} />
                          <h3>{task.title}</h3>
                          {task.description && <RichTextContent value={task.description} />}
                          {task.attachmentCount > 0 && <AttachmentViewer owner={{ type: "taskId", id: task.id }} />}
                          <div className="task-time-grid">
                            <span><small>预估</small><b>{task.estimateHours.toFixed(1)}h</b></span>
                            <span><small>实际</small><b>{task.actualHours.toFixed(1)}h</b></span>
                            <span className={overrun ? "risk" : ""}>
                              <small>{overrun ? "已超出" : "剩余"}</small>
                              <b>{Math.abs(remaining).toFixed(1)}h</b>
                            </span>
                          </div>
                          {task.canLogWork && (
                            <button className="task-log-work" type="button" onClick={() => openWorkLog(task)}>
                              <Clock3 size={12} />
                              {task.status === "done" && task.actualHours <= 0
                                ? "补录实际工时"
                                : "登记实际工时"}
                            </button>
                          )}
                          <footer>
                            <span className={overdue ? "risk" : ""}>
                              {overdue ? <CircleAlert size={13} /> : <CalendarClock size={13} />}
                              {dateLabel(task.dueDate)}
                            </span>
                            <span className="task-people">
                              <span className="task-assignee" title={`开发：${task.assigneeName ?? "待认领"}`}>
                                {task.assigneeName?.slice(0, 1) ?? "?"}
                              </span>
                              <span className="task-assignee task-tester" title={`测试：${task.testerName ?? "待指派"}`}>
                                {task.testerName?.slice(0, 1) ?? "测"}
                              </span>
                            </span>
                          </footer>
                          {task.completedAt && (
                            <div className="completed-time">
                              <CheckCircle2 size={12} /> 完成于 {completedLabel(task.completedAt)}
                            </div>
                          )}
                          {task.latestRejection && (
                            <div className="task-rejection-note">
                              <header><Undo2 size={12} /> 上次测试未通过 · {task.latestRejection.testerName}</header>
                              <RichTextContent value={task.latestRejection.reason} />
                              <AttachmentViewer owner={{ type: "rejectionId", id: task.latestRejection.id }} />
                            </div>
                          )}
                        </article>
                      );
                    })}
                    {canCreate && (
                      <button className="add-column-task" type="button" onClick={() => openCreate(status)}>
                        <Plus size={14} /> 添加任务
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : tasks.length ? (
        <section className="entity-table-shell" aria-label="任务列表">
          <table className="entity-table task-entity-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>项目 / 迭代</th>
                <th>状态</th>
                <th>负责人</th>
                <th>截止 / 完成</th>
                <th>工时</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTasks.map((task) => {
                const remaining = task.estimateHours - task.actualHours;
                const overrun = task.estimateHours > 0 && remaining < 0;
                const hasActions =
                  task.canEdit ||
                  task.canChangeStatus ||
                  task.canReject ||
                  task.canDelete ||
                  task.canLogWork;
                return (
                  <tr
                    className={initialTaskId === task.id ? "deep-linked" : ""}
                    id={`task-${task.id}`}
                    key={task.id}
                  >
                    <td>
                      <div className="task-list-title">
                        <div>
                          <span className={`task-priority priority-${task.priority}`}>
                            {taskPriorityLabels[task.priority]}
                          </span>
                        </div>
                        <strong>{task.title}</strong>
                        {task.description && <RichTextContent value={task.description} />}
                        {task.attachmentCount > 0 && <AttachmentViewer owner={{ type: "taskId", id: task.id }} />}
                        {task.latestRejection && (
                          <span className="entity-rejection"><Undo2 size={11} /> 上次测试未通过 · {task.latestRejection.testerName}</span>
                        )}
                      </div>
                    </td>
                    <td><TaskContext task={task} compact /></td>
                    <td>
                      {task.canChangeStatus ? (
                        <select
                          className={`task-status-select status-${task.status}`}
                          value={task.status}
                          aria-label={`修改 ${task.title} 的状态`}
                          onChange={(event) => void updateStatus(task.id, event.target.value as TaskStatus)}
                        >
                          {taskStatuses.map((status) => <option value={status} key={status}>{taskStatusLabels[status]}</option>)}
                        </select>
                      ) : (
                        <span className={`task-status status-${task.status}`}>{taskStatusLabels[task.status]}</span>
                      )}
                    </td>
                    <td>
                      <div className="entity-stacked-value">
                        <span><UserRound size={12} /> 开发：{task.assigneeName ?? "待认领"}</span>
                        <small><ShieldCheck size={12} /> 测试：{task.testerName ?? "待指派"}</small>
                      </div>
                    </td>
                    <td>
                      <div className="entity-stacked-value">
                        <span className={task.overdue ? "risk" : ""}>
                          {task.overdue ? <CircleAlert size={12} /> : <CalendarClock size={12} />}
                          {dateLabel(task.dueDate)}
                        </span>
                        <small>{task.completedAt ? `完成于 ${completedLabel(task.completedAt)}` : "尚未完成"}</small>
                      </div>
                    </td>
                    <td>
                      <div className="entity-stacked-value">
                        <span>预估 / 实际 <b>{task.estimateHours.toFixed(1)} / {task.actualHours.toFixed(1)}h</b></span>
                        <small className={overrun ? "risk" : ""}>{overrun ? "已超出" : "剩余"} {Math.abs(remaining).toFixed(1)}h</small>
                      </div>
                    </td>
                    <td className="entity-actions-cell">
                      {hasActions ? (
                        <div className="entity-actions">
                          {task.canLogWork && (
                            <button type="button" onClick={() => openWorkLog(task)}><Clock3 size={14} /> 登记</button>
                          )}
                          {task.canEdit && (
                            <button type="button" onClick={() => openEdit(task)}><Edit3 size={14} /> 编辑</button>
                          )}
                          {task.canReject && (
                            <button type="button" onClick={() => openReject(task)}><Undo2 size={14} /> 打回</button>
                          )}
                          {task.canDelete && (
                            <button className="danger" type="button" onClick={() => void deleteTask(task)}><Trash2 size={14} /> 删除</button>
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
      ) : (
        <div className="module-empty large"><ClipboardList size={30} /><b>没有符合条件的任务</b><span>调整筛选条件，或创建一项新任务。</span></div>
      )}

      {!loading && tasks.length > 0 && (
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={tasks.length}
          itemLabel="项任务"
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
        />
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="workspace-modal task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
            <header>
              <div>
                <span className="eyebrow">{editingId ? "编辑任务" : "新任务"}</span>
                <h2 id="task-modal-title">{editingId ? "更新任务资料" : "创建一项可交付任务"}</h2>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="关闭"><X size={18} /></button>
            </header>
            <form onSubmit={saveTask}>
              <div className="workspace-form-grid">
                <label className="form-wide">
                  <span>任务标题</span>
                  <input required disabled={testerStatusOnly} maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="清晰描述需要完成的结果" />
                </label>
                <label>
                  <span>所属项目</span>
                  <select required disabled={Boolean(editingId && !editingTask?.canManageProject)} value={form.projectId} onChange={(e) => {
                    const nextProjectId = e.target.value;
                    setForm({
                      ...form,
                      projectId: nextProjectId,
                      sprintId: "",
                      assigneeId: assignees.some(
                        (assignee) =>
                          assignee.id === form.assigneeId &&
                          assignee.projectIds.includes(nextProjectId),
                      )
                        ? form.assigneeId
                        : "",
                      testerId: testers.some(
                        (tester) =>
                          tester.id === form.testerId &&
                          tester.projectIds.includes(nextProjectId),
                      )
                        ? form.testerId
                        : "",
                    });
                  }}>
                    <option value="">请选择</option>
                    {projects.filter((project) =>
                      editingId
                        ? project.id === form.projectId || project.canManage
                        : project.canCreateTask,
                    ).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>所属迭代</span>
                  <select
                    disabled={Boolean(editingId && !editingTask?.canManageProject)}
                    value={form.sprintId}
                    onChange={(e) => setForm({ ...form, sprintId: e.target.value })}
                  >
                    <option value="">未规划</option>
                    {sprints
                      .filter(
                        (sprint) =>
                          sprint.projectId === form.projectId && sprint.status !== "completed",
                      )
                      .map((sprint) => (
                        <option key={sprint.id} value={sprint.id}>
                          {sprint.name} · {sprintStatusLabels[sprint.status]}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>开发负责人</span>
                  <select disabled={Boolean(editingId && !editingTask?.canManageProject)} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                    <option value="">待认领</option>
                    {assignees.filter((assignee) =>
                      assignee.projectIds.includes(form.projectId) &&
                      (formProject?.canManage || assignee.id === currentUserId),
                    ).map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>测试负责人</span>
                  <select disabled={editingId ? !editingTask?.canManageProject : currentUserRole === "tester"} value={form.testerId} onChange={(e) => setForm({ ...form, testerId: e.target.value })}>
                    <option value="">待指派</option>
                    {testers.filter((tester) => tester.projectIds.includes(form.projectId)).map((tester) => <option key={tester.id} value={tester.id}>{tester.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>任务状态</span>
                  <select disabled={Boolean(editingId && !editingTask?.canChangeStatus)} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
                    {taskStatuses.map((status) => <option key={status} value={status}>{taskStatusLabels[status]}</option>)}
                  </select>
                </label>
                <label>
                  <span>优先级</span>
                  <select disabled={testerStatusOnly} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
                    {Object.entries(taskPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>预估工时（小时）</span>
                  <input disabled={testerStatusOnly} type="number" min="0" step="0.5" value={form.estimateHours} onChange={(e) => setForm({ ...form, estimateHours: Number(e.target.value) })} />
                </label>
                <label>
                  <span>实际工时（小时）</span>
                  <input
                    type="number"
                    value={tasks.find((task) => task.id === editingId)?.actualHours ?? 0}
                    disabled
                    readOnly
                  />
                </label>
                <label>
                  <span>截止日期</span>
                  <input disabled={testerStatusOnly} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </label>
                <AttachmentEditor
                  draftToken={attachmentDraftToken}
                  owner={editingId ? { type: "taskId", id: editingId } : undefined}
                  value={form.description}
                  onChange={(description) => setForm({ ...form, description })}
                  label="任务说明与附件"
                  placeholder="补充验收标准、背景或注意事项；上传图片后会插入预览。"
                  disabled={testerStatusOnly}
                />
              </div>
              <div className="time-form-hint">
                <Clock3 size={15} />
                <span>开发负责人推进任务执行；进入待评审后由指定测试负责人验收或打回。实际工时由开发负责人在任务看板登记并自动汇总。</span>
              </div>
              <footer>
                <button type="button" onClick={() => setModalOpen(false)}>取消</button>
                <button className="primary-action" type="submit" disabled={saving}>
                  {saving ? "保存中…" : editingId ? "保存修改" : "创建任务"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {rejectingTask && (
        <div className="modal-backdrop" role="presentation">
          <section className="workspace-modal task-reject-modal" role="dialog" aria-modal="true" aria-labelledby="task-reject-title">
            <header>
              <div>
                <span className="eyebrow">测试不通过</span>
                <h2 id="task-reject-title">打回：{rejectingTask.title}</h2>
              </div>
              <button type="button" onClick={() => setRejectingTask(null)} aria-label="关闭"><X size={18} /></button>
            </header>
            <form onSubmit={rejectTask}>
              <AttachmentEditor
                draftToken={rejectionDraftToken}
                value={rejectionReason}
                onChange={setRejectionReason}
                label="不通过原因与附件"
                placeholder="说明复现步骤、实际结果和期望结果；可上传截图或其他附件。"
              />
              <div className="time-form-hint"><Undo2 size={15} /><span>提交后任务会从“待评审”退回“开发中”，并通知开发负责人。</span></div>
              <footer>
                <button type="button" onClick={() => setRejectingTask(null)}>取消</button>
                <button className="primary-action" type="submit" disabled={rejecting}>{rejecting ? "提交中…" : "确认打回"}</button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {loggingTask && (
        <div className="modal-backdrop" role="presentation">
          <section className="workspace-modal task-work-log-modal" role="dialog" aria-modal="true" aria-labelledby="task-work-log-title">
            <header>
              <div>
                <span className="eyebrow">{loggingTask.status === "done" && loggingTask.actualHours <= 0 ? "补录工时" : "登记工时"}</span>
                <h2 id="task-work-log-title">记录实际投入</h2>
              </div>
              <button type="button" onClick={() => setLoggingTask(null)} aria-label="关闭"><X size={18} /></button>
            </header>
            <form onSubmit={saveWorkLog}>
              {error && <div className="module-alert">{error}</div>}
              <div className="workspace-form-grid">
                <div className="task-work-log-context form-wide">
                  <span className="project-mark" style={{ background: loggingTask.projectColor }}>{loggingTask.projectCode.slice(0, 2)}</span>
                  <div><small>{loggingTask.projectCode} · {loggingTask.projectName}</small><b>{loggingTask.title}</b></div>
                </div>
                <label><span>工作日期</span><input required type="date" value={workLogForm.workDate} onChange={(event) => setWorkLogForm({ ...workLogForm, workDate: event.target.value })} /></label>
                <label><span>实际工时（小时）</span><input required type="number" min="0.1" max="24" step="0.1" value={workLogForm.durationHours} onChange={(event) => setWorkLogForm({ ...workLogForm, durationHours: Number(event.target.value) })} /></label>
                <label className="form-wide"><span>工作说明</span><textarea rows={4} maxLength={500} value={workLogForm.note} onChange={(event) => setWorkLogForm({ ...workLogForm, note: event.target.value })} placeholder="简要说明完成了什么、遇到什么问题。" /></label>
              </div>
              <div className="time-form-hint"><UserRound size={15} /><span>实际工时仅允许该任务当前指定的开发负责人本人登记，保存后会自动更新任务实际工时。</span></div>
              <footer><button type="button" onClick={() => setLoggingTask(null)}>取消</button><button className="primary-action" type="submit" disabled={loggingWork}>{loggingWork ? "保存中…" : "保存工时"}</button></footer>
            </form>
            <div className="work-logs-history" style={{ padding: '0 20px 20px', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
              <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>历史记录</h3>
              {loadingWorkLogs ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>加载中...</div>
              ) : workLogs.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>暂无工时记录。</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {workLogs.map((log) => (
                    <li key={log.id} style={{ fontSize: '13px', padding: '10px', background: 'var(--bg-subtle)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div>
                          <strong>{log.user.name}</strong>
                          <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>{log.workDate}</span>
                          <span style={{ color: 'var(--brand)' }}>{log.durationHours}h</span>
                        </div>
                        {log.user.id === currentUserId && (
                          <button
                            type="button"
                            onClick={() => deleteWorkLog(log.id)}
                            style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                          >
                            删除
                          </button>
                        )}
                      </div>
                      {log.note && <div style={{ color: 'var(--text-muted)' }}>{log.note}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast"><CheckCircle2 size={16} /> {notice}</div>}
    </div>
  );
}
