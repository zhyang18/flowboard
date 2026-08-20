"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FolderKanban,
  Gauge,
  RefreshCw,
  Users2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserRole } from "@/db/schema";
import { useTranslation } from "@/lib/i18n";
import PaginationControls, { useClientPagination } from "../pagination-controls";

type ReportData = {
  period: number;
  stats: {
    projectCount: number;
    taskCount: number;
    completionRate: number;
    overdue: number;
    estimateHours: number;
    actualHours: number;
    deviation: number;
    loggedHours: number;
    testingTaskCount: number;
    awaitingTesterCount: number;
  };
  projectDelivery: Array<{
    id: string;
    name: string;
    code: string;
    color: string;
    total: number;
    completed: number;
    testingTaskCount: number;
    awaitingTesterCount: number;
    progress: number;
    estimateHours: number;
    actualHours: number;
    deviation: number;
  }>;
  memberLoad: Array<{
    id: string;
    name: string;
    role: UserRole;
    hours: number;
    projectCount: number;
    utilization: number;
  }>;
  weekly: Array<{ label: string; hours: number }>;
  statusDistribution: Array<{
    status: string;
    label: string;
    count: number;
  }>;
};

/**
 * 转义 CSV 单元格并阻止电子表格公式注入。
 *
 * @param value 需要导出的单元格值。
 * @return 可安全写入 CSV 的双引号字段。
 */
function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

/**
 * 渲染支持中英文国际化的交付快照、周期工时趋势与成员负载报表。
 *
 * @param props 组件属性。
 * @param props.canExport 当前用户是否具备报表文件导出权限。
 * @return 报表中心组件。
 */
export default function ReportsDashboard({
  canExport,
}: {
  canExport: boolean;
}) {
  const { t, getRoleLabel } = useTranslation();
  const [period, setPeriod] = useState("30");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * 加载当前周期报表。
   *
   * @return 加载完成后的 Promise。
   */
  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reports?period=${period}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as ReportData & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? t("common.error"));
      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t("common.error"),
      );
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReport]);

  const weeklyMax = Math.max(
    1,
    ...(data?.weekly.map((item) => item.hours) ?? [1]),
  );
  const statusTotal = useMemo(
    () =>
      data?.statusDistribution.reduce((sum, item) => sum + item.count, 0) ?? 0,
    [data],
  );
  const projectPagination = useClientPagination(data?.projectDelivery ?? []);
  const memberPagination = useClientPagination(data?.memberLoad ?? []);

  /**
   * 将当前项目交付报表导出为安全 CSV。
   */
  function exportCsv() {
    if (!data) return;
    const rows = [
      [
        t("projects.codeLabel"),
        t("projects.nameLabel"),
        t("reports.tasksTotal"),
        t("reports.tasksCompleted"),
        t("reports.testerAssigned"),
        t("reports.awaitingTester"),
        t("reports.completionRateLabel"),
        t("reports.estimateHoursCol"),
        t("reports.actualHoursCol"),
        t("reports.deviationCol"),
      ],
      ...data.projectDelivery.map((project) => [
        project.code,
        project.name,
        project.total,
        project.completed,
        project.testingTaskCount,
        project.awaitingTesterCount,
        `${project.progress}%`,
        project.estimateHours,
        project.actualHours,
        `${project.deviation}%`,
      ]),
    ];
    const csv = `\uFEFF${rows
      .map((row) => row.map(csvCell).join(","))
      .join("\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `flowboard-report-${period}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="module-page reports-page">
      <section className="module-heading">
        <div>
          <span className="eyebrow">{t("reports.eyebrow")}</span>
          <h2>{t("reports.heading")}</h2>
          <p>{t("reports.description")}</p>
        </div>
        <div className="report-heading-actions">
          <label className="module-select">
            <select
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value);
                projectPagination.resetPage();
                memberPagination.resetPage();
              }}
            >
              <option value="7">{t("reports.periods.7d")}</option>
              <option value="30">{t("reports.periods.30d")}</option>
              <option value="90">{t("reports.periods.90d")}</option>
              <option value="365">{t("reports.periods.1y")}</option>
            </select>
          </label>
          <button
            className="secondary-action"
            type="button"
            onClick={() => void loadReport()}
            aria-label={t("reports.refreshAria")}
          >
            <RefreshCw size={15} />
          </button>
          {canExport && (
            <button
              className="primary-action module-primary report-export"
              type="button"
              onClick={exportCsv}
              disabled={!data}
            >
              <Download size={16} /> {t("reports.exportCsv")}
            </button>
          )}
        </div>
      </section>

      {error && <div className="module-alert">{error}</div>}
      {loading || !data ? (
        <div className="module-loading">{t("common.loading")}</div>
      ) : (
        <>
          <section className="report-stat-grid">
            <article>
              <span className="metric-icon blue">
                <FolderKanban size={19} />
              </span>
              <div>
                <small>{t("reports.summary.projectTaskSummary")}</small>
                <b>
                  {data.stats.projectCount}{" "}
                  <i>/ {data.stats.taskCount}</i>
                </b>
              </div>
              <em>{t("reports.summary.activePortfolio")}</em>
            </article>
            <article>
              <span className="metric-icon green">
                <CheckCircle2 size={19} />
              </span>
              <div>
                <small>{t("reports.summary.completionRate")}</small>
                <b>{data.stats.completionRate}%</b>
              </div>
              <em>
                {data.stats.taskCount
                  ? t("reports.summary.completedTasksCount", {
                      count: Math.round(
                        (data.stats.taskCount * data.stats.completionRate) /
                          100,
                      ),
                    })
                  : t("reports.summary.noTasksYet")}
              </em>
            </article>
            <article>
              <span className="metric-icon violet">
                <Clock3 size={19} />
              </span>
              <div>
                <small>{t("workbench.actualVsEstimateHours")}</small>
                <b>
                  {data.stats.actualHours.toFixed(1)}h{" "}
                  <i>/ {data.stats.estimateHours.toFixed(1)}h</i>
                </b>
              </div>
              <em className={data.stats.deviation > 10 ? "risk" : ""}>
                {t("workbench.deviationRisk", {
                  sign: data.stats.deviation > 0 ? "+" : "",
                  deviation: data.stats.deviation,
                })}
              </em>
            </article>
            <article>
              <span className="metric-icon orange">
                <AlertTriangle size={19} />
              </span>
              <div>
                <small>{t("reports.summary.testCoverage")}</small>
                <b>
                  {data.stats.testingTaskCount}{" "}
                  <i>/ {data.stats.awaitingTesterCount}</i>
                </b>
              </div>
              <em className={data.stats.awaitingTesterCount ? "risk" : ""}>
                {data.stats.awaitingTesterCount
                  ? t("reports.summary.needsTesterNotice")
                  : t("workbench.overdueTasks") + `: ${data.stats.overdue}`}
              </em>
            </article>
          </section>

          <section className="report-main-grid">
            <article className="module-card report-trend-card">
              <header className="module-card-header">
                <div>
                  <span className="eyebrow">{t("reports.trendEyebrow")}</span>
                  <h3>{t("reports.trendHeading")}</h3>
                </div>
                <span className="header-count">
                  {t("reports.trendTotalLogged", {
                    hours: data.stats.loggedHours.toFixed(1),
                  })}
                </span>
              </header>
              <div className="report-bar-chart">
                {data.weekly.map((item) => (
                  <div key={item.label}>
                    <span>
                      <i
                        style={{
                          height: `${Math.max(5, (item.hours / weeklyMax) * 100)}%`,
                        }}
                      />
                    </span>
                    <b>{item.hours.toFixed(1)}h</b>
                    <small>{item.label}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className="module-card status-distribution-card">
              <header className="module-card-header">
                <div>
                  <span className="eyebrow">{t("reports.distributionEyebrow")}</span>
                  <h3>{t("reports.distributionHeading")}</h3>
                </div>
              </header>
              <div className="status-donut-wrap">
                <div
                  className="status-donut"
                  style={
                    {
                      "--completion": `${data.stats.completionRate * 3.6}deg`,
                    } as React.CSSProperties
                  }
                >
                  <span>
                    <b>{data.stats.completionRate}%</b>
                    <small>{t("reports.completionRateLabel")}</small>
                  </span>
                </div>
                <div className="status-legend">
                  {data.statusDistribution.map((item) => (
                    <div key={item.status}>
                      <i className={`status-color-${item.status}`} />
                      <span>{item.label}</span>
                      <b>{item.count}</b>
                      <small>
                        {statusTotal
                          ? Math.round((item.count / statusTotal) * 100)
                          : 0}
                        %
                      </small>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>

          <section className="report-detail-grid">
            <article className="module-card project-report-card">
              <header className="module-card-header">
                <div>
                  <span className="eyebrow">{t("reports.projectPerfEyebrow")}</span>
                  <h3>{t("reports.projectPerfHeading")}</h3>
                </div>
              </header>
              <div className="project-report-list">
                {projectPagination.pageItems.map((project) => (
                  <div key={project.id}>
                    <span
                      className="project-mark"
                      style={{ background: project.color }}
                    >
                      {project.code.slice(0, 2)}
                    </span>
                    <div>
                      <header>
                        <b>{project.name}</b>
                        <span>
                          {project.completed}/{project.total} ·{" "}
                          {project.progress}%
                        </span>
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
                          {t("reports.estimateHoursCol")}: {project.estimateHours.toFixed(1)}h
                        </span>
                        <span>
                          {t("reports.actualHoursCol")}: {project.actualHours.toFixed(1)}h
                        </span>
                        <span>
                          QA: {project.testingTaskCount}/{project.total}
                        </span>
                        <strong
                          className={project.deviation > 10 ? "risk" : ""}
                        >
                          {project.deviation > 0 ? "+" : ""}
                          {project.deviation}%
                        </strong>
                      </footer>
                    </div>
                  </div>
                ))}
              </div>
              {data.projectDelivery.length > 0 && (
                <PaginationControls
                  page={projectPagination.page}
                  pageSize={projectPagination.pageSize}
                  total={data.projectDelivery.length}
                  itemLabel={t("projects.itemUnit")}
                  onPageChange={projectPagination.setPage}
                  onPageSizeChange={projectPagination.changePageSize}
                />
              )}
            </article>
            <article className="module-card member-report-card">
              <header className="module-card-header">
                <div>
                  <span className="eyebrow">{t("reports.memberLoadEyebrow")}</span>
                  <h3>{t("reports.memberLoadHeading")}</h3>
                </div>
                <Users2 size={18} />
              </header>
              <div className="member-report-list">
                {data.memberLoad.length ? (
                  memberPagination.pageItems.map((member) => (
                    <div key={member.id}>
                      <span className="avatar">
                        {member.name.slice(0, 1)}
                      </span>
                      <div>
                        <header>
                          <b>
                            {member.name} · {getRoleLabel(member.role)}
                          </b>
                          <span>
                            {member.hours.toFixed(1)}h ·{" "}
                            {member.projectCount} {t("projects.itemUnit")}
                          </span>
                        </header>
                        <div className="progress-track">
                          <i
                            style={{
                              width: `${Math.min(100, member.utilization)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <strong
                        className={member.utilization > 100 ? "risk" : ""}
                      >
                        {member.utilization}%
                      </strong>
                    </div>
                  ))
                ) : (
                  <div className="module-empty">
                    <Gauge size={24} /> {t("reports.noMemberHours")}
                  </div>
                )}
              </div>
              {data.memberLoad.length > 0 && (
                <PaginationControls
                  page={memberPagination.page}
                  pageSize={memberPagination.pageSize}
                  total={data.memberLoad.length}
                  itemLabel={t("users.itemUnit")}
                  onPageChange={memberPagination.setPage}
                  onPageSizeChange={memberPagination.changePageSize}
                />
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}
