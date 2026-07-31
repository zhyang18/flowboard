import type { Metadata } from "next";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FolderKanban,
  Gauge,
  ListChecks,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects, tasks, users } from "@/db/schema";
import {
  projectStatusLabels,
  taskStatusLabels,
} from "@/lib/workspace";

export const metadata: Metadata = { title: "工作台" };
export const dynamic = "force-dynamic";
const dashboardReferenceTime = Date.now();

function dateLabel(date: Date | null) {
  if (!date) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export default async function WorkbenchPage() {
  const db = getDb();
  const [projectRows, taskRows] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(eq(projects.archived, false))
      .orderBy(asc(projects.dueDate)),
    db
      .select({
        task: tasks,
        projectName: projects.name,
        projectCode: projects.code,
        projectColor: projects.color,
        assigneeName: users.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(eq(projects.archived, false))
      .orderBy(desc(tasks.updatedAt)),
  ]);

  const totalTasks = taskRows.length;
  const doneTasks = taskRows.filter(({ task }) => task.status === "done").length;
  const activeTasks = taskRows.filter(({ task }) =>
    ["todo", "in_progress", "review"].includes(task.status),
  ).length;
  const overdueTasks = taskRows.filter(
    ({ task }) =>
      task.status !== "done" &&
      task.dueDate &&
      task.dueDate.getTime() < dashboardReferenceTime,
  ).length;
  const estimateHours = taskRows.reduce(
    (sum, { task }) => sum + task.estimateHours,
    0,
  );
  const actualHours = taskRows.reduce(
    (sum, { task }) => sum + task.actualHours,
    0,
  );
  const completionRate = totalTasks
    ? Math.round((doneTasks / totalTasks) * 100)
    : 0;
  const hourDeviation = estimateHours
    ? Math.round(((actualHours - estimateHours) / estimateHours) * 100)
    : 0;

  const projectMetrics = projectRows.map((project) => {
    const projectTasks = taskRows.filter(
      ({ task }) => task.projectId === project.id,
    );
    const done = projectTasks.filter(({ task }) => task.status === "done").length;
    const estimate = projectTasks.reduce(
      (sum, { task }) => sum + task.estimateHours,
      0,
    );
    const actual = projectTasks.reduce(
      (sum, { task }) => sum + task.actualHours,
      0,
    );
    return {
      ...project,
      total: projectTasks.length,
      done,
      estimate,
      actual,
      progress: projectTasks.length
        ? Math.round((done / projectTasks.length) * 100)
        : 0,
    };
  });

  const focusTasks = taskRows
    .filter(({ task }) => task.status !== "done")
    .sort((a, b) => {
      const priority = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priority[a.task.priority] - priority[b.task.priority];
    })
    .slice(0, 6);

  return (
    <div className="module-page workbench-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">今日交付视图</span>
          <h2>上午好，掌握团队当前进度</h2>
          <p>聚合项目、任务和工时偏差，优先处理影响交付的事项。</p>
        </div>
        <Link className="primary-action module-primary" href="/dashboard/board">
          打开任务看板 <ArrowRight size={16} />
        </Link>
      </section>

      <section className="workbench-metrics" aria-label="核心指标">
        <article>
          <span className="metric-icon blue"><FolderKanban size={19} /></span>
          <div><small>活跃项目</small><b>{projectRows.filter((p) => p.status === "active").length}</b></div>
          <em><TrendingUp size={13} /> 共 {projectRows.length} 个</em>
        </article>
        <article>
          <span className="metric-icon violet"><ListChecks size={19} /></span>
          <div><small>进行中任务</small><b>{activeTasks}</b></div>
          <em>{completionRate}% 已完成</em>
        </article>
        <article>
          <span className="metric-icon green"><Clock3 size={19} /></span>
          <div><small>实际 / 预估工时</small><b>{actualHours.toFixed(1)}h <i>/ {estimateHours.toFixed(1)}h</i></b></div>
          <em className={hourDeviation > 10 ? "risk" : ""}>
            偏差 {hourDeviation > 0 ? "+" : ""}{hourDeviation}%
          </em>
        </article>
        <article>
          <span className="metric-icon orange"><CircleAlert size={19} /></span>
          <div><small>已逾期任务</small><b>{overdueTasks}</b></div>
          <em className={overdueTasks ? "risk" : ""}>
            {overdueTasks ? "需要立即关注" : "交付节奏正常"}
          </em>
        </article>
      </section>

      <section className="workbench-grid">
        <article className="module-card delivery-card">
          <header className="module-card-header">
            <div>
              <span className="eyebrow">项目组合</span>
              <h3>交付进度</h3>
            </div>
            <Link href="/dashboard/projects">查看全部 <ArrowRight size={14} /></Link>
          </header>
          <div className="delivery-list">
            {projectMetrics.length ? projectMetrics.slice(0, 5).map((project) => (
              <div className="delivery-row" key={project.id}>
                <span
                  className="project-mark"
                  style={{ background: project.color }}
                >
                  {project.code.slice(0, 2)}
                </span>
                <div className="delivery-main">
                  <header>
                    <div>
                      <b>{project.name}</b>
                      <small>{projectStatusLabels[project.status]} · {project.done}/{project.total} 项任务</small>
                    </div>
                    <strong>{project.progress}%</strong>
                  </header>
                  <div className="progress-track">
                    <i style={{ width: `${project.progress}%`, background: project.color }} />
                  </div>
                  <footer>
                    <span><CalendarClock size={12} /> {dateLabel(project.dueDate)}</span>
                    <span>工时 {project.actual.toFixed(1)} / {project.estimate.toFixed(1)}h</span>
                  </footer>
                </div>
              </div>
            )) : (
              <div className="module-empty">还没有项目，先创建一个项目开始规划。</div>
            )}
          </div>
        </article>

        <article className="module-card focus-card">
          <header className="module-card-header">
            <div>
              <span className="eyebrow">优先级队列</span>
              <h3>需要关注</h3>
            </div>
            <span className="header-count">{focusTasks.length} 项</span>
          </header>
          <div className="focus-list">
            {focusTasks.length ? focusTasks.map(({ task, projectName, projectCode, projectColor, assigneeName }) => {
              const remaining = Math.max(0, task.estimateHours - task.actualHours);
              const overrun = task.actualHours > task.estimateHours && task.estimateHours > 0;
              return (
                <Link href="/dashboard/board" className="focus-row" key={task.id}>
                  <span className={`priority-line priority-${task.priority}`} />
                  <div>
                    <small>
                      <i style={{ background: projectColor }} /> {projectCode} · {projectName}
                    </small>
                    <b>{task.title}</b>
                    <footer>
                      <span>{assigneeName ?? "待认领"}</span>
                      <span className={overrun ? "risk" : ""}>
                        {overrun ? `超出 ${(task.actualHours - task.estimateHours).toFixed(1)}h` : `剩余 ${remaining.toFixed(1)}h`}
                      </span>
                    </footer>
                  </div>
                  <span className={`task-status status-${task.status}`}>
                    {taskStatusLabels[task.status]}
                  </span>
                </Link>
              );
            }) : (
              <div className="module-empty">
                <CheckCircle2 size={24} /> 当前没有待处理任务
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="workbench-bottom">
        <article className="module-card time-health">
          <span className="metric-icon teal"><Gauge size={20} /></span>
          <div>
            <small>工时健康度</small>
            <b>{hourDeviation <= 10 ? "节奏稳定" : "存在超时风险"}</b>
            <p>预估 {estimateHours.toFixed(1)}h，实际已投入 {actualHours.toFixed(1)}h。</p>
          </div>
        </article>
        <article className="module-card completion-health">
          <span className="metric-icon green"><CheckCircle2 size={20} /></span>
          <div>
            <small>任务完成率</small>
            <b>{completionRate}%</b>
            <div className="progress-track"><i style={{ width: `${completionRate}%` }} /></div>
          </div>
        </article>
      </section>
    </div>
  );
}
