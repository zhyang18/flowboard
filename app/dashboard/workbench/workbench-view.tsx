"use client";

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
import { useTranslation } from "@/lib/i18n";
import type { TaskPriority, TaskStatus, ProjectStatus } from "@/db/schema";

export type WorkbenchProjectMetric = {
  id: string;
  name: string;
  code: string;
  color: string;
  status: ProjectStatus;
  dueDate: string | null;
  total: number;
  done: number;
  estimate: number;
  actual: number;
  progress: number;
};

export type WorkbenchFocusTask = {
  task: {
    id: string;
    title: string;
    priority: TaskPriority;
    status: TaskStatus;
    estimateHours: number;
    actualHours: number;
  };
  projectName: string;
  projectCode: string;
  projectColor: string;
  assigneeName: string | null;
  testerName: string | null;
};

export type WorkbenchViewProps = {
  projectRowsCount: number;
  activeProjectsCount: number;
  activeTasks: number;
  doneTasks: number;
  totalTasks: number;
  overdueTasks: number;
  estimateHours: number;
  actualHours: number;
  completionRate: number;
  hourDeviation: number;
  projectMetrics: WorkbenchProjectMetric[];
  focusTasks: WorkbenchFocusTask[];
};

/**
 * 格式化简短展示日期。
 *
 * @param dateStr ISO 日期字符串。
 * @param locale 当前语言环境代码。
 * @return 本地化日期格式文本。
 */
function formatDate(dateStr: string | null, locale: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return dateStr;
  }
}

/**
 * 获取当前时段适用的问候语。
 *
 * @param t 国际化文案提取函数。
 * @return 本地化问候语文案。
 */
function getGreeting(t: (path: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("workbench.morningGreeting");
  if (hour < 18) return t("workbench.afternoonGreeting");
  return t("workbench.eveningGreeting");
}

/**
 * 渲染支持中英文国际化的工作台聚合视图。
 *
 * @param props 工作台数据属性。
 * @return 工作台视图内容组件。
 */
export default function WorkbenchView({
  projectRowsCount,
  activeProjectsCount,
  activeTasks,
  overdueTasks,
  estimateHours,
  actualHours,
  completionRate,
  hourDeviation,
  projectMetrics,
  focusTasks,
}: WorkbenchViewProps) {
  const { t, locale, getProjectStatusLabel, getTaskStatusLabel } =
    useTranslation();

  return (
    <div className="module-page workbench-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">{t("workbench.eyebrow")}</span>
          <h2>{getGreeting(t)}</h2>
          <p>{t("workbench.description")}</p>
        </div>
        <Link className="primary-action module-primary" href="/dashboard/board">
          {t("workbench.openBoard")} <ArrowRight size={16} />
        </Link>
      </section>

      <section className="workbench-metrics" aria-label={t("workbench.metricsAria")}>
        <article>
          <span className="metric-icon blue">
            <FolderKanban size={19} />
          </span>
          <div>
            <small>{t("workbench.activeProjects")}</small>
            <b>{activeProjectsCount}</b>
          </div>
          <em>
            <TrendingUp size={13} />{" "}
            {t("workbench.totalProjectsSuffix", { count: projectRowsCount })}
          </em>
        </article>
        <article>
          <span className="metric-icon violet">
            <ListChecks size={19} />
          </span>
          <div>
            <small>{t("workbench.inProgressTasks")}</small>
            <b>{activeTasks}</b>
          </div>
          <em>
            {t("workbench.completedTasksRatio", { rate: completionRate })}
          </em>
        </article>
        <article>
          <span className="metric-icon green">
            <Clock3 size={19} />
          </span>
          <div>
            <small>{t("workbench.actualVsEstimateHours")}</small>
            <b>
              {actualHours.toFixed(1)}h{" "}
              <i>/ {estimateHours.toFixed(1)}h</i>
            </b>
          </div>
          <em className={hourDeviation > 10 ? "risk" : ""}>
            {t("workbench.deviationRisk", {
              sign: hourDeviation > 0 ? "+" : "",
              deviation: hourDeviation,
            })}
          </em>
        </article>
        <article>
          <span className="metric-icon orange">
            <CircleAlert size={19} />
          </span>
          <div>
            <small>{t("workbench.overdueTasks")}</small>
            <b>{overdueTasks}</b>
          </div>
          <em className={overdueTasks ? "risk" : ""}>
            {overdueTasks
              ? t("workbench.overdueRiskNotice")
              : t("workbench.overdueNormalNotice")}
          </em>
        </article>
      </section>

      <section className="workbench-grid">
        <article className="module-card delivery-card">
          <header className="module-card-header">
            <div>
              <span className="eyebrow">{t("workbench.portfolioHeading")}</span>
              <h3>{t("workbench.portfolioDeliveryProgress")}</h3>
            </div>
            <Link href="/dashboard/projects">
              {t("common.viewAll")} <ArrowRight size={14} />
            </Link>
          </header>
          <div className="delivery-list">
            {projectMetrics.length ? (
              projectMetrics.slice(0, 5).map((project) => (
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
                        <small>
                          {getProjectStatusLabel(project.status)} ·{" "}
                          {t("workbench.taskCountSummary", {
                            done: project.done,
                            total: project.total,
                          })}
                        </small>
                      </div>
                      <strong>{project.progress}%</strong>
                    </header>
                    <div className="progress-track">
                      <i
                        style={{
                          width: `${project.progress}%`,
                          background: project.color,
                        }}
                      />
                    </div>
                    <footer>
                      <span>
                        <CalendarClock size={12} />{" "}
                        {project.dueDate
                          ? formatDate(project.dueDate, locale)
                          : t("common.none")}
                      </span>
                      <span>
                        {t("workbench.hoursSummary", {
                          actual: project.actual.toFixed(1),
                          estimate: project.estimate.toFixed(1),
                        })}
                      </span>
                    </footer>
                  </div>
                </div>
              ))
            ) : (
              <div className="module-empty">
                {t("workbench.noProjectsEmpty")}
              </div>
            )}
          </div>
        </article>

        <article className="module-card focus-card">
          <header className="module-card-header">
            <div>
              <span className="eyebrow">{t("workbench.priorityQueueHeading")}</span>
              <h3>{t("workbench.focusHeading")}</h3>
            </div>
            <span className="header-count">
              {t("workbench.focusItemsCount", { count: focusTasks.length })}
            </span>
          </header>
          <div className="focus-list">
            {focusTasks.length ? (
              focusTasks.map(
                ({
                  task,
                  projectName,
                  projectCode,
                  projectColor,
                  assigneeName,
                  testerName,
                }) => {
                  const remaining = Math.max(
                    0,
                    task.estimateHours - task.actualHours,
                  );
                  const overrun =
                    task.actualHours > task.estimateHours &&
                    task.estimateHours > 0;
                  return (
                    <Link
                      href="/dashboard/board"
                      className="focus-row"
                      key={task.id}
                    >
                      <span
                        className={`priority-line priority-${task.priority}`}
                      />
                      <div>
                        <small>
                          <i style={{ background: projectColor }} />{" "}
                          {projectCode} · {projectName}
                        </small>
                        <b>{task.title}</b>
                        <footer>
                          <span>
                            {t("workbench.devTesterInfo", {
                              dev: assigneeName ?? t("common.unclaimed"),
                              tester: testerName ?? t("common.unassigned"),
                            })}
                          </span>
                          <span className={overrun ? "risk" : ""}>
                            {overrun
                              ? t("workbench.hoursOverrun", {
                                  hours: (
                                    task.actualHours - task.estimateHours
                                  ).toFixed(1),
                                })
                              : t("workbench.hoursRemaining", {
                                  hours: remaining.toFixed(1),
                                })}
                          </span>
                        </footer>
                      </div>
                      <span className={`task-status status-${task.status}`}>
                        {getTaskStatusLabel(task.status)}
                      </span>
                    </Link>
                  );
                },
              )
            ) : (
              <div className="module-empty">
                <CheckCircle2 size={24} /> {t("workbench.noTasksEmpty")}
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="workbench-bottom">
        <article className="module-card time-health">
          <span className="metric-icon teal">
            <Gauge size={20} />
          </span>
          <div>
            <small>{t("workbench.timeHealthTitle")}</small>
            <b>
              {hourDeviation <= 10
                ? t("workbench.timeHealthStable")
                : t("workbench.timeHealthRisk")}
            </b>
            <p>
              {t("workbench.timeHealthDesc", {
                estimate: estimateHours.toFixed(1),
                actual: actualHours.toFixed(1),
              })}
            </p>
          </div>
        </article>
        <article className="module-card completion-health">
          <span className="metric-icon green">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <small>{t("workbench.completionRateTitle")}</small>
            <b>{completionRate}%</b>
            <div className="progress-track">
              <i style={{ width: `${completionRate}%` }} />
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
