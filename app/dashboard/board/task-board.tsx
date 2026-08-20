"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  Edit3,
  GripVertical,
  ListFilter,
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
import type {
  SprintStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "@/db/schema";
import { taskStatuses } from "@/lib/workspace";
import { useTranslation } from "@/lib/i18n";
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
};

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
 * @param props 组件属性。
 * @param props.task 包含项目与迭代归属信息的任务。
 * @param props.compact 是否使用列表视图的紧凑布局。
 * @return 任务项目和迭代归属信息块。
 */
function TaskContext({
  task,
  compact = false,
}: {
  task: BoardTask;
  compact?: boolean;
}) {
  const { t, getSprintStatusLabel } = useTranslation();
  const sprintState = task.sprintStatus ?? "unplanned";
  return (
    <div className={`task-context${compact ? " compact" : ""}`}>
      <div
        className="task-project-context"
        style={{ borderLeftColor: task.projectColor }}
        title={`${t("projects.codeLabel")}：${task.projectCode} · ${task.projectName}`}
      >
        <span className="task-project-code">{task.projectCode}</span>
        <span>
          <small>{t("sprints.projectLabel")}</small>
          <strong>{task.projectName}</strong>
        </span>
      </div>
      <div
        className={`task-sprint-context sprint-${sprintState}`}
        title={`${t("board.sprintLabel")}：${task.sprintName ?? t("board.noSprint")}`}
      >
        <CalendarRange size={15} />
        <span>
          <small>{t("board.sprintLabel")}</small>
          <strong>{task.sprintName ?? t("board.noSprint")}</strong>
        </span>
        <em>
          {task.sprintStatus
            ? getSprintStatusLabel(task.sprintStatus)
            : t("common.unassigned")}
        </em>
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
 * 将接口日期转换为日期输入框值。
 *
 * @param value ISO 日期字符串。
 * @return YYYY-MM-DD 字符串。
 */
function dateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * 格式化任务截止日期。
 *
 * @param value ISO 日期字符串。
 * @param locale 当前语言环境。
 * @param noneLabel 未设置时的占位文本。
 * @return 本地化日期显示。
 */
function dateLabel(
  value: string | null,
  locale: string,
  noneLabel: string,
): string {
  if (!value) return noneLabel;
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
 * 格式化任务完成时间。
 *
 * @param value ISO 时间字符串。
 * @param locale 当前语言环境。
 * @return 本地化完成时间。
 */
function completedLabel(value: string | null, locale: string): string {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * 创建工时表单初始值。
 *
 * @return 初始工时表单数据。
 */
function createWorkLogForm(): WorkLogForm {
  return {
    workDate: new Date().toISOString().slice(0, 10),
    durationHours: 1,
    note: "",
  };
}

/**
 * 渲染支持中英文国际化的任务看板、五阶段流转与工时维护。
 *
 * @param props 组件属性。
 * @param props.initialTaskId 初始化直达高亮任务 ID。
 * @return 任务看板组件。
 */
export default function TaskBoard({
  initialTaskId,
}: {
  initialTaskId?: string;
}) {
  const {
    t,
    locale,
    getTaskStatusLabel,
    getTaskPriorityLabel,
    getSprintStatusLabel,
  } = useTranslation();
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
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
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

  const priorities: TaskPriority[] = ["urgent", "high", "medium", "low"];

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
    if (statusFilter) params.set("status", statusFilter);
    if (initialTaskId) params.set("taskId", initialTaskId);
    if (query.trim()) params.set("query", query.trim());
    try {
      const response = await fetch(`/api/tasks?${params}`, {
        cache: "no-store",
      });
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
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
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
      setError(
        loadError instanceof Error ? loadError.message : t("common.error"),
      );
    } finally {
      setLoading(false);
    }
  }, [
    assigneeId,
    initialTaskId,
    projectId,
    query,
    sprintId,
    statusFilter,
    t,
    testerId,
  ]);

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
    if (
      !initialTaskId ||
      loading ||
      !tasks.some((task) => task.id === initialTaskId)
    ) {
      return;
    }
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

  const sortedTasks = useMemo(() => {
    if (!sortField) return tasks;
    return [...tasks].sort((a, b) => {
      let result = 0;
      if (sortField === "task") {
        result = a.title.localeCompare(b.title, locale === "zh" ? "zh-CN" : "en-US");
        if (result === 0) {
          const priorityRank = { urgent: 4, high: 3, medium: 2, low: 1 };
          result =
            (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
        }
      } else if (sortField === "project") {
        result = a.projectName.localeCompare(
          b.projectName,
          locale === "zh" ? "zh-CN" : "en-US",
        );
      } else if (sortField === "status") {
        const statusRank = {
          backlog: 0,
          todo: 1,
          in_progress: 2,
          review: 3,
          done: 4,
        };
        result = (statusRank[a.status] ?? 0) - (statusRank[b.status] ?? 0);
      } else if (sortField === "assignee") {
        result = (a.assigneeName || "zzz").localeCompare(
          b.assigneeName || "zzz",
          locale === "zh" ? "zh-CN" : "en-US",
        );
      } else if (sortField === "dueDate") {
        const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        result = aTime - bTime;
      } else if (sortField === "hours") {
        result = a.estimateHours - b.estimateHours;
        if (result === 0) {
          result = a.actualHours - b.actualHours;
        }
      }
      return sortOrder === "asc" ? result : -result;
    });
  }, [tasks, sortField, sortOrder, locale]);

  const {
    page,
    pageSize,
    pageItems: paginatedTasks,
    setPage,
    changePageSize,
    resetPage,
  } = useClientPagination(sortedTasks);

  /**
   * 触发任务列表表头排序。
   *
   * @param field 目标排序字段名称。
   */
  function handleSort(field: string) {
    if (sortField === field) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
    resetPage();
  }

  /**
   * 渲染任务列表表头排序指示图标。
   *
   * @param field 列对应排序字段。
   * @return 排序指示图标元素。
   */
  function renderSortIcon(field: string) {
    if (sortField !== field) {
      return <ArrowUpDown size={13} className="sort-icon inactive" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp size={13} className="sort-icon active" />
    ) : (
      <ArrowDown size={13} className="sort-icon active" />
    );
  }

  /**
   * 在可写项目中打开新建任务表单。
   *
   * @param status 默认任务状态。
   */
  function openCreate(status: TaskStatus = "todo") {
    const writableProject =
      projects.find(
        (project) => project.id === projectId && project.canCreateTask,
      ) ?? projects.find((project) => project.canCreateTask);
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
        editingTask &&
        currentUserRole === "tester" &&
        !editingTask.canManageProject
          ? { status: form.status }
          : { ...form, attachmentDraftToken };
      const response = await fetch(
        editingId ? `/api/tasks/${editingId}` : "/api/tasks",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setModalOpen(false);
      setNotice(t("board.saveSuccess"));
      await loadTasks();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("common.error"),
      );
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
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(t("board.statusUpdatedSuccess"));
      await loadTasks();
    } catch (updateError) {
      setTasks(previous);
      setError(
        updateError instanceof Error
          ? updateError.message
          : t("common.error"),
      );
    }
  }

  /**
   * 处理任务拖放到目标状态列。
   *
   * @param event 拖放事件。
   * @param status 目标状态。
   */
  function onDrop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/task-id") || draggedId;
    setDraggedId(null);
    setDropStatus(null);
    const task = tasks.find((item) => item.id === taskId);
    if (task?.canChangeStatus && task.status !== status) {
      void updateStatus(task.id, status);
    }
  }

  /**
   * 确认后删除没有工时历史的任务。
   *
   * @param task 待删除任务。
   * @return 删除完成后的 Promise。
   */
  async function deleteTask(task: BoardTask) {
    const confirmed = await confirm({
      title: t("common.delete"),
      message: `${t("common.delete")} "${task.title}"?`,
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setNotice(t("board.deleteSuccess"));
      await loadTasks();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : t("common.error"),
      );
    }
  }

  /**
   * 打开测试不通过表单并初始化独立附件草稿。
   *
   * @param task 待测试打回的任务。
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
  async function rejectTask(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
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
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setRejectingTask(null);
      setNotice(t("board.statusUpdatedSuccess"));
      await loadTasks();
    } catch (rejectError) {
      setError(
        rejectError instanceof Error
          ? rejectError.message
          : t("common.error"),
      );
    } finally {
      setRejecting(false);
    }
  }

  /**
   * 加载指定任务的历史工时记录。
   *
   * @param taskId 任务 ID。
   */
  async function loadWorkLogs(taskId: string) {
    setLoadingWorkLogs(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/work-logs`);
      const result = await response.json();
      if (response.ok) {
        setWorkLogs(result.data || []);
      }
    } catch {
      // 忽略非关键错误
    } finally {
      setLoadingWorkLogs(false);
    }
  }

  /**
   * 在任务看板内打开指定任务的工时登记表单。
   *
   * @param task 待登记实际工时的任务。
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
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setLoggingTask(null);
      setNotice(t("time.saveSuccess"));
      await loadTasks();
    } catch (workLogError) {
      setError(
        workLogError instanceof Error
          ? workLogError.message
          : t("common.error"),
      );
    } finally {
      setLoggingWork(false);
    }
  }

  /**
   * 删除工时记录并重新汇总任务实际工时。
   *
   * @param logId 工时记录 ID。
   */
  async function deleteWorkLog(logId: string) {
    const confirmed = await confirm({
      title: t("time.deleteConfirmTitle"),
      message: t("time.deleteConfirmMsg"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/work-logs/${logId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("common.error"));
      }
      setNotice(t("time.deleteSuccess"));
      if (loggingTask) loadWorkLogs(loggingTask.id);
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const editingTask = tasks.find((task) => task.id === editingId);
  const testerStatusOnly = Boolean(
    editingTask &&
      currentUserRole === "tester" &&
      !editingTask.canManageProject,
  );
  const formProject = projects.find(
    (project) => project.id === form.projectId,
  );

  return (
    <div className="module-page board-page">
      <section className="module-heading board-heading">
        <div>
          <span className="eyebrow">{t("board.eyebrow")}</span>
          <h2>{t("board.heading")}</h2>
          <p>{t("board.description")}</p>
        </div>
        {canCreate && (
          <button
            className="primary-action module-primary"
            type="button"
            onClick={() => openCreate()}
          >
            <Plus size={16} /> {t("board.newTask")}
          </button>
        )}
      </section>

      <section className="board-summary">
        <div>
          <small>{t("workbench.portfolioHeading")}</small>
          <b>{tasks.length}</b>
        </div>
        <div>
          <small>{t("settings.defaultEstimate")}</small>
          <b>{metrics.estimate.toFixed(1)}h</b>
        </div>
        <div>
          <small>{t("login.showcaseActualHours")}</small>
          <b>{metrics.actual.toFixed(1)}h</b>
        </div>
        <div className={metrics.overdue ? "risk" : ""}>
          <small>{t("workbench.overdueTasks")}</small>
          <b>{metrics.overdue}</b>
        </div>
      </section>

      <section className="module-toolbar board-toolbar">
        <label className="module-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetPage();
            }}
            placeholder={t("board.searchPlaceholder")}
          />
        </label>
        <label className="module-select">
          <span
            className="select-color"
            style={{
              background:
                projects.find((project) => project.id === projectId)?.color ??
                "#9aa6b2",
            }}
          />
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setSprintId("");
              resetPage();
            }}
          >
            <option value="">{t("board.filterProject")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="module-select">
          <CalendarRange size={14} />
          <select
            value={sprintId}
            onChange={(event) => {
              setSprintId(event.target.value);
              resetPage();
            }}
          >
            <option value="">{t("board.filterSprint")}</option>
            <option value="unplanned">{t("board.noSprint")}</option>
            {sprints
              .filter(
                (sprint) => !projectId || sprint.projectId === projectId,
              )
              .map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {
                    projects.find(
                      (project) => project.id === sprint.projectId,
                    )?.code
                  }{" "}
                  · {sprint.name}
                </option>
              ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="module-select">
          <UserRound size={14} />
          <select
            value={assigneeId}
            onChange={(event) => {
              setAssigneeId(event.target.value);
              resetPage();
            }}
          >
            <option value="">{t("board.filterAssignee")}</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="module-select">
          <ShieldCheck size={14} />
          <select
            value={testerId}
            onChange={(event) => {
              setTesterId(event.target.value);
              resetPage();
            }}
          >
            <option value="">{t("board.filterTester")}</option>
            {testers.map((tester) => (
              <option key={tester.id} value={tester.id}>
                {tester.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="module-select">
          <ListFilter size={14} />
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              resetPage();
            }}
          >
            <option value="">{t("projects.allStatuses")}</option>
            {taskStatuses.map((st) => (
              <option value={st} key={st}>
                {getTaskStatusLabel(st)}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <div className="toolbar-view-options">
          <span className="toolbar-result">
            {t("pagination.totalSummary", {
              total: tasks.length,
              label: t("workbench.portfolioHeading"),
            })}
          </span>
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            cardLabel={t("viewMode.card")}
            listLabel={t("viewMode.list")}
          />
        </div>
      </section>

      {error && <div className="module-alert">{error}</div>}

      {loading ? (
        <div className="module-loading">{t("common.loading")}</div>
      ) : viewMode === "card" ? (
        <section className="kanban-scroll" aria-label={t("board.heading")}>
          <div className="kanban-board">
            {taskStatuses.map((status) => {
              const allColumnTasks = tasks.filter(
                (task) => task.status === status,
              );
              const columnTasks = paginatedTasks.filter(
                (task) => task.status === status,
              );
              const columnEstimate = allColumnTasks.reduce(
                (sum, task) => sum + task.estimateHours,
                0,
              );
              return (
                <section
                  className={`kanban-column column-${status} ${dropStatus === status ? "drop-target" : ""}`}
                  key={status}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropStatus(status);
                  }}
                  onDragLeave={(event) => {
                    if (
                      !event.currentTarget.contains(
                        event.relatedTarget as Node,
                      )
                    ) {
                      setDropStatus(null);
                    }
                  }}
                  onDrop={(event) => onDrop(event, status)}
                >
                  <header className="kanban-column-header">
                    <div>
                      <i />
                      <b>{getTaskStatusLabel(status)}</b>
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
                            event.dataTransfer.setData(
                              "text/task-id",
                              task.id,
                            );
                          }}
                          onDragEnd={() => {
                            setDraggedId(null);
                            setDropStatus(null);
                          }}
                        >
                          <header>
                            <span
                              className={`task-priority priority-${task.priority}`}
                            >
                              {getTaskPriorityLabel(task.priority)}
                            </span>
                            {(task.canEdit ||
                              task.canChangeStatus ||
                              task.canReject ||
                              task.canDelete) && (
                              <div className="task-card-actions">
                                {task.canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => openEdit(task)}
                                    aria-label={`${t("common.edit")} ${task.title}`}
                                  >
                                    <Edit3 size={13} />
                                  </button>
                                )}
                                {task.canReject && (
                                  <button
                                    type="button"
                                    onClick={() => openReject(task)}
                                    aria-label={`Reject ${task.title}`}
                                  >
                                    <Undo2 size={13} />
                                  </button>
                                )}
                                {task.canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => deleteTask(task)}
                                    aria-label={`${t("common.delete")} ${task.title}`}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                                {task.canChangeStatus && (
                                  <GripVertical size={14} />
                                )}
                              </div>
                            )}
                          </header>
                          <TaskContext task={task} />
                          <h3>{task.title}</h3>
                          {task.description && (
                            <RichTextContent value={task.description} />
                          )}
                          {task.attachmentCount > 0 && (
                            <AttachmentViewer
                              owner={{ type: "taskId", id: task.id }}
                            />
                          )}
                          <div className="task-time-grid">
                            <span>
                              <small>
                                {t("board.taskCard.estimate", {
                                  hours: task.estimateHours.toFixed(1),
                                })}
                              </small>
                            </span>
                            <span>
                              <small>
                                {t("board.taskCard.actual", {
                                  hours: task.actualHours.toFixed(1),
                                })}
                              </small>
                            </span>
                            <span className={overrun ? "risk" : ""}>
                              <small>
                                {overrun
                                  ? t("workbench.hoursOverrun", {
                                      hours: Math.abs(remaining).toFixed(1),
                                    })
                                  : t("workbench.hoursRemaining", {
                                      hours: Math.max(0, remaining).toFixed(1),
                                    })}
                              </small>
                            </span>
                          </div>
                          {task.canLogWork && (
                            <button
                              className="task-log-work"
                              type="button"
                              onClick={() => openWorkLog(task)}
                            >
                              <Clock3 size={12} />
                              {task.status === "done" && task.actualHours <= 0
                                ? t("board.taskCard.supplementHours")
                                : t("time.logTimeButton")}
                            </button>
                          )}
                          <footer>
                            <span className={overdue ? "risk" : ""}>
                              {overdue ? (
                                <CircleAlert size={13} />
                              ) : (
                                <CalendarClock size={13} />
                              )}
                              {dateLabel(
                                task.dueDate,
                                locale,
                                t("common.none"),
                              )}
                            </span>
                            <span className="task-people">
                              <span
                                className="task-assignee"
                                title={`Dev: ${task.assigneeName ?? t("common.unclaimed")}`}
                              >
                                {task.assigneeName?.slice(0, 1) ?? "?"}
                              </span>
                              <span
                                className="task-assignee task-tester"
                                title={`QA: ${task.testerName ?? t("common.unassigned")}`}
                              >
                                {task.testerName?.slice(0, 1) ?? "T"}
                              </span>
                            </span>
                          </footer>
                          {task.completedAt && (
                            <div className="completed-time">
                              <CheckCircle2 size={12} />{" "}
                              {completedLabel(task.completedAt, locale)}
                            </div>
                          )}
                          {task.latestRejection && (
                            <div className="task-rejection-note">
                              <header>
                                <Undo2 size={12} />{" "}
                                {task.latestRejection.testerName}
                              </header>
                              <RichTextContent
                                value={task.latestRejection.reason}
                              />
                              <AttachmentViewer
                                owner={{
                                  type: "rejectionId",
                                  id: task.latestRejection.id,
                                }}
                              />
                            </div>
                          )}
                        </article>
                      );
                    })}
                    {canCreate && (
                      <button
                        className="add-column-task"
                        type="button"
                        onClick={() => openCreate(status)}
                      >
                        <Plus size={14} /> {t("board.newTask")}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : tasks.length ? (
        <section className="entity-table-shell" aria-label={t("board.heading")}>
          <table className="entity-table task-entity-table">
            <thead>
              <tr>
                <th
                  className="sortable-th"
                  onClick={() => handleSort("task")}
                >
                  <div className="th-content">
                    <span>{t("workbench.portfolioHeading")}</span>
                    {renderSortIcon("task")}
                  </div>
                </th>
                <th
                  className="sortable-th"
                  onClick={() => handleSort("project")}
                >
                  <div className="th-content">
                    <span>
                      {t("sprints.projectLabel")} / {t("board.sprintLabel")}
                    </span>
                    {renderSortIcon("project")}
                  </div>
                </th>
                <th
                  className="sortable-th"
                  onClick={() => handleSort("status")}
                >
                  <div className="th-content">
                    <span>{t("common.status")}</span>
                    {renderSortIcon("status")}
                  </div>
                </th>
                <th
                  className="sortable-th"
                  onClick={() => handleSort("assignee")}
                >
                  <div className="th-content">
                    <span>{t("projects.owner")}</span>
                    {renderSortIcon("assignee")}
                  </div>
                </th>
                <th
                  className="sortable-th"
                  onClick={() => handleSort("dueDate")}
                >
                  <div className="th-content">
                    <span>{t("common.dueDate")}</span>
                    {renderSortIcon("dueDate")}
                  </div>
                </th>
                <th
                  className="sortable-th"
                  onClick={() => handleSort("hours")}
                >
                  <div className="th-content">
                    <span>{t("common.hours")}</span>
                    {renderSortIcon("hours")}
                  </div>
                </th>
                <th className="actions-column">{t("common.actions")}</th>
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
                          <span
                            className={`task-priority priority-${task.priority}`}
                          >
                            {getTaskPriorityLabel(task.priority)}
                          </span>
                        </div>
                        <strong>{task.title}</strong>
                        {task.description && (
                          <RichTextContent value={task.description} />
                        )}
                        {task.attachmentCount > 0 && (
                          <AttachmentViewer
                            owner={{ type: "taskId", id: task.id }}
                          />
                        )}
                        {task.latestRejection && (
                          <span className="entity-rejection">
                            <Undo2 size={11} />{" "}
                            {task.latestRejection.testerName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <TaskContext task={task} compact />
                    </td>
                    <td>
                      {task.canChangeStatus ? (
                        <select
                          className={`task-status-select status-${task.status}`}
                          value={task.status}
                          aria-label={`Update status of ${task.title}`}
                          onChange={(event) =>
                            void updateStatus(
                              task.id,
                              event.target.value as TaskStatus,
                            )
                          }
                        >
                          {taskStatuses.map((st) => (
                            <option value={st} key={st}>
                              {getTaskStatusLabel(st)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`task-status status-${task.status}`}>
                          {getTaskStatusLabel(task.status)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="entity-stacked-value">
                        <span>
                          <UserRound size={12} />{" "}
                          {task.assigneeName ?? t("common.unclaimed")}
                        </span>
                        <small>
                          <ShieldCheck size={12} />{" "}
                          {task.testerName ?? t("common.unassigned")}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="entity-stacked-value">
                        <span className={task.overdue ? "risk" : ""}>
                          {task.overdue ? (
                            <CircleAlert size={12} />
                          ) : (
                            <CalendarClock size={12} />
                          )}
                          {dateLabel(
                            task.dueDate,
                            locale,
                            t("common.none"),
                          )}
                        </span>
                        <small>
                          {task.completedAt
                            ? completedLabel(task.completedAt, locale)
                            : t("common.none")}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="entity-stacked-value">
                        <span>
                          <b>
                            {task.estimateHours.toFixed(1)} /{" "}
                            {task.actualHours.toFixed(1)}h
                          </b>
                        </span>
                        <small className={overrun ? "risk" : ""}>
                          {overrun
                            ? t("workbench.hoursOverrun", {
                                hours: Math.abs(remaining).toFixed(1),
                              })
                            : t("workbench.hoursRemaining", {
                                hours: Math.max(0, remaining).toFixed(1),
                              })}
                        </small>
                      </div>
                    </td>
                    <td className="entity-actions-cell">
                      {hasActions ? (
                        <div className="entity-actions">
                          {task.canLogWork && (
                            <button
                              type="button"
                              onClick={() => openWorkLog(task)}
                            >
                              <Clock3 size={14} /> {t("time.logTimeButton")}
                            </button>
                          )}
                          {task.canEdit && (
                            <button
                              type="button"
                              onClick={() => openEdit(task)}
                            >
                              <Edit3 size={14} /> {t("common.edit")}
                            </button>
                          )}
                          {task.canReject && (
                            <button
                              type="button"
                              onClick={() => openReject(task)}
                            >
                              <Undo2 size={14} /> {t("board.rejectConfirmButton")}
                            </button>
                          )}
                          {task.canDelete && (
                            <button
                              className="danger"
                              type="button"
                              onClick={() => void deleteTask(task)}
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
      ) : (
        <div className="module-empty large">
          <ClipboardList size={30} />
          <b>{t("projects.noMatches")}</b>
          <span>{t("projects.createFirstProject")}</span>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={tasks.length}
          itemLabel={t("workbench.portfolioHeading")}
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
        />
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="workspace-modal task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
          >
            <header>
              <div>
                <span className="eyebrow">
                  {editingId
                    ? t("board.modalEditTitle")
                    : t("board.modalCreateTitle")}
                </span>
                <h2 id="task-modal-title">
                  {editingId
                    ? t("board.modalEditTitle")
                    : t("board.modalCreateTitle")}
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
            <form onSubmit={saveTask}>
              <div className="workspace-form-grid">
                <label className="form-wide">
                  <span>{t("board.titleLabel")}</span>
                  <input
                    required
                    disabled={testerStatusOnly}
                    maxLength={160}
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    placeholder={t("board.titlePlaceholder")}
                  />
                </label>
                <label>
                  <span>{t("sprints.projectLabel")}</span>
                  <select
                    required
                    disabled={Boolean(
                      editingId && !editingTask?.canManageProject,
                    )}
                    value={form.projectId}
                    onChange={(e) => {
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
                    }}
                  >
                    <option value="">{t("projects.selectOwner")}</option>
                    {projects
                      .filter((project) =>
                        editingId
                          ? project.id === form.projectId || project.canManage
                          : project.canCreateTask,
                      )
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.code} · {project.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>{t("board.sprintLabel")}</span>
                  <select
                    disabled={Boolean(
                      editingId && !editingTask?.canManageProject,
                    )}
                    value={form.sprintId}
                    onChange={(e) =>
                      setForm({ ...form, sprintId: e.target.value })
                    }
                  >
                    <option value="">{t("board.noSprint")}</option>
                    {sprints
                      .filter(
                        (sprint) =>
                          sprint.projectId === form.projectId &&
                          sprint.status !== "completed",
                      )
                      .map((sprint) => (
                        <option key={sprint.id} value={sprint.id}>
                          {sprint.name} · {getSprintStatusLabel(sprint.status)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>{t("board.assigneeLabel")}</span>
                  <select
                    disabled={Boolean(
                      editingId && !editingTask?.canManageProject,
                    )}
                    value={form.assigneeId}
                    onChange={(e) =>
                      setForm({ ...form, assigneeId: e.target.value })
                    }
                  >
                    <option value="">{t("common.unclaimed")}</option>
                    {assignees
                      .filter(
                        (assignee) =>
                          assignee.projectIds.includes(form.projectId) &&
                          (formProject?.canManage ||
                            assignee.id === currentUserId),
                      )
                      .map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>{t("board.testerLabel")}</span>
                  <select
                    disabled={
                      editingId
                        ? !editingTask?.canManageProject
                        : currentUserRole === "tester"
                    }
                    value={form.testerId}
                    onChange={(e) =>
                      setForm({ ...form, testerId: e.target.value })
                    }
                  >
                    <option value="">{t("common.unassigned")}</option>
                    {testers
                      .filter((tester) =>
                        tester.projectIds.includes(form.projectId),
                      )
                      .map((tester) => (
                        <option key={tester.id} value={tester.id}>
                          {tester.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>{t("board.statusLabel")}</span>
                  <select
                    disabled={Boolean(
                      editingId && !editingTask?.canChangeStatus,
                    )}
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as TaskStatus })
                    }
                  >
                    {taskStatuses.map((st) => (
                      <option key={st} value={st}>
                        {getTaskStatusLabel(st)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("board.priorityLabel")}</span>
                  <select
                    disabled={testerStatusOnly}
                    value={form.priority}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        priority: e.target.value as TaskPriority,
                      })
                    }
                  >
                    {priorities.map((p) => (
                      <option key={p} value={p}>
                        {getTaskPriorityLabel(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("board.estimateHoursLabel")}</span>
                  <input
                    disabled={testerStatusOnly}
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.estimateHours}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        estimateHours: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>{t("board.actualHoursLabel")}</span>
                  <input
                    type="number"
                    value={
                      tasks.find((task) => task.id === editingId)?.actualHours ??
                      0
                    }
                    disabled
                    readOnly
                  />
                </label>
                <label>
                  <span>{t("common.dueDate")}</span>
                  <input
                    disabled={testerStatusOnly}
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
                    editingId ? { type: "taskId", id: editingId } : undefined
                  }
                  value={form.description}
                  onChange={(description) =>
                    setForm({ ...form, description })
                  }
                  label={t("board.descriptionLabel")}
                  placeholder={t("board.descriptionPlaceholder")}
                  disabled={testerStatusOnly}
                />
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
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {rejectingTask && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="workspace-modal task-reject-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-reject-title"
          >
            <header>
              <div>
                <span className="eyebrow">{t("board.rejectReasonTitle")}</span>
                <h2 id="task-reject-title">{rejectingTask.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setRejectingTask(null)}
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={rejectTask}>
              <AttachmentEditor
                draftToken={rejectionDraftToken}
                value={rejectionReason}
                onChange={setRejectionReason}
                label={t("board.rejectReasonTitle")}
                placeholder={t("board.rejectReasonPlaceholder")}
              />
              <footer>
                <button
                  type="button"
                  onClick={() => setRejectingTask(null)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={rejecting}
                >
                  {rejecting
                    ? t("common.saving")
                    : t("board.rejectConfirmButton")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {loggingTask && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="workspace-modal task-work-log-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-work-log-title"
          >
            <header>
              <div>
                <span className="eyebrow">{t("time.logTimeButton")}</span>
                <h2 id="task-work-log-title">{loggingTask.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setLoggingTask(null)}
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={saveWorkLog}>
              {error && <div className="module-alert">{error}</div>}
              <div className="workspace-form-grid">
                <label>
                  <span>{t("time.dateLabel")}</span>
                  <input
                    required
                    type="date"
                    value={workLogForm.workDate}
                    onChange={(event) =>
                      setWorkLogForm({
                        ...workLogForm,
                        workDate: event.target.value,
                      })
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
                    value={workLogForm.durationHours}
                    onChange={(event) =>
                      setWorkLogForm({
                        ...workLogForm,
                        durationHours: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="form-wide">
                  <span>{t("time.workDescriptionLabel")}</span>
                  <textarea
                    rows={4}
                    maxLength={500}
                    value={workLogForm.note}
                    onChange={(event) =>
                      setWorkLogForm({
                        ...workLogForm,
                        note: event.target.value,
                      })
                    }
                    placeholder={t("time.workDescriptionPlaceholder")}
                  />
                </label>
              </div>
              <footer>
                <button
                  type="button"
                  onClick={() => setLoggingTask(null)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={loggingWork}
                >
                  {loggingWork ? t("common.saving") : t("common.save")}
                </button>
              </footer>
            </form>
            <div
              className="work-logs-history"
              style={{
                padding: "0 20px 20px",
                marginTop: "20px",
                borderTop: "1px solid var(--border)",
                paddingTop: "15px",
              }}
            >
              <h3 style={{ fontSize: "14px", marginBottom: "10px" }}>
                {t("board.workLogsTab")}
              </h3>
              {loadingWorkLogs ? (
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  {t("common.loading")}
                </div>
              ) : workLogs.length === 0 ? (
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  {t("time.noLogsEmpty")}
                </div>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {workLogs.map((log) => (
                    <li
                      key={log.id}
                      style={{
                        fontSize: "13px",
                        padding: "10px",
                        background: "var(--bg-subtle)",
                        borderRadius: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "4px",
                        }}
                      >
                        <div>
                          <strong>{log.user.name}</strong>
                          <span
                            style={{
                              margin: "0 8px",
                              color: "var(--text-muted)",
                            }}
                          >
                            {log.workDate}
                          </span>
                          <span style={{ color: "var(--brand)" }}>
                            {log.durationHours}h
                          </span>
                        </div>
                        {log.user.id === currentUserId && (
                          <button
                            type="button"
                            onClick={() => deleteWorkLog(log.id)}
                            style={{
                              color: "var(--danger)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "12px",
                              padding: 0,
                            }}
                          >
                            {t("common.delete")}
                          </button>
                        )}
                      </div>
                      {log.note && (
                        <div style={{ color: "var(--text-muted)" }}>
                          {log.note}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
