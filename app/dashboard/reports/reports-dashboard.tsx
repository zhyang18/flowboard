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
import { roleLabels } from "@/lib/users";
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
 * 渲染交付快照、周期工时趋势和成员负载报表。
 *
 * @param canExport 当前用户是否具备报表文件导出权限。
 * @return 报表组件。
 */
export default function ReportsDashboard({ canExport }: { canExport: boolean }) {
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
      const result = (await response.json()) as ReportData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "报表加载失败。");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "报表加载失败。");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(), 0);
    return () => window.clearTimeout(timer);
  }, [loadReport]);

  const weeklyMax = Math.max(1, ...(data?.weekly.map((item) => item.hours) ?? [1]));
  const statusTotal = useMemo(
    () => data?.statusDistribution.reduce((sum, item) => sum + item.count, 0) ?? 0,
    [data],
  );
  const projectPagination = useClientPagination(data?.projectDelivery ?? []);
  const memberPagination = useClientPagination(data?.memberLoad ?? []);

  /**
   * 将当前项目交付报表导出为安全 CSV。
   *
   * @return 无返回值。
   */
  function exportCsv() {
    if (!data) return;
    const rows = [
      ["项目代号", "项目名称", "任务总数", "已完成", "测试已指派", "评审待指派测试", "完成率", "预估工时", "实际工时", "偏差"],
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
      .map((row) =>
        row.map(csvCell).join(","),
      )
      .join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
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
          <span className="eyebrow">数据驱动复盘</span>
          <h2>把交付表现变成可行动的洞察</h2>
          <p>统一观察开发与测试任务完成、项目偏差、成员投入和阶段趋势。</p>
        </div>
        <div className="report-heading-actions">
          <label className="module-select"><select value={period} onChange={(event) => {
            setPeriod(event.target.value);
            projectPagination.resetPage();
            memberPagination.resetPage();
          }}><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="90">最近 90 天</option><option value="365">最近一年</option></select></label>
          <button className="secondary-action" type="button" onClick={() => void loadReport()} aria-label="刷新报表"><RefreshCw size={15} /></button>
          {canExport && <button className="primary-action module-primary report-export" type="button" onClick={exportCsv} disabled={!data}><Download size={16} /> 导出 CSV</button>}
        </div>
      </section>

      {error && <div className="module-alert">{error}</div>}
      {loading || !data ? <div className="module-loading">正在生成报表…</div> : (
        <>
          <section className="report-stat-grid">
            <article><span className="metric-icon blue"><FolderKanban size={19} /></span><div><small>项目 / 任务</small><b>{data.stats.projectCount} <i>/ {data.stats.taskCount}</i></b></div><em>当前项目组合</em></article>
            <article><span className="metric-icon green"><CheckCircle2 size={19} /></span><div><small>任务完成率</small><b>{data.stats.completionRate}%</b></div><em>{data.stats.taskCount ? `${Math.round((data.stats.taskCount * data.stats.completionRate) / 100)} 项已完成` : "暂无任务"}</em></article>
            <article><span className="metric-icon violet"><Clock3 size={19} /></span><div><small>实际 / 预估</small><b>{data.stats.actualHours.toFixed(1)}h <i>/ {data.stats.estimateHours.toFixed(1)}h</i></b></div><em className={data.stats.deviation > 10 ? "risk" : ""}>偏差 {data.stats.deviation > 0 ? "+" : ""}{data.stats.deviation}%</em></article>
            <article><span className="metric-icon orange"><AlertTriangle size={19} /></span><div><small>测试覆盖 / 待指派</small><b>{data.stats.testingTaskCount} <i>/ {data.stats.awaitingTesterCount}</i></b></div><em className={data.stats.awaitingTesterCount ? "risk" : ""}>{data.stats.awaitingTesterCount ? "评审任务需补充测试负责人" : `逾期任务 ${data.stats.overdue}`}</em></article>
          </section>

          <section className="report-main-grid">
            <article className="module-card report-trend-card">
              <header className="module-card-header"><div><span className="eyebrow">工时趋势</span><h3>所选周期登记工时</h3></div><span className="header-count">累计 {data.stats.loggedHours.toFixed(1)}h</span></header>
              <div className="report-bar-chart">
                {data.weekly.map((item) => <div key={item.label}><span><i style={{ height: `${Math.max(5, (item.hours / weeklyMax) * 100)}%` }} /></span><b>{item.hours.toFixed(1)}h</b><small>{item.label}</small></div>)}
              </div>
            </article>
            <article className="module-card status-distribution-card">
              <header className="module-card-header"><div><span className="eyebrow">任务结构</span><h3>状态分布</h3></div></header>
              <div className="status-donut-wrap">
                <div className="status-donut" style={{ "--completion": `${data.stats.completionRate * 3.6}deg` } as React.CSSProperties}><span><b>{data.stats.completionRate}%</b><small>完成率</small></span></div>
                <div className="status-legend">{data.statusDistribution.map((item) => <div key={item.status}><i className={`status-color-${item.status}`} /><span>{item.label}</span><b>{item.count}</b><small>{statusTotal ? Math.round((item.count / statusTotal) * 100) : 0}%</small></div>)}</div>
              </div>
            </article>
          </section>

          <section className="report-detail-grid">
            <article className="module-card project-report-card">
              <header className="module-card-header"><div><span className="eyebrow">项目表现</span><h3>交付与工时偏差</h3></div></header>
              <div className="project-report-list">
                {projectPagination.pageItems.map((project) => (
                  <div key={project.id}>
                    <span className="project-mark" style={{ background: project.color }}>{project.code.slice(0, 2)}</span>
                    <div><header><b>{project.name}</b><span>{project.completed}/{project.total} · {project.progress}%</span></header><div className="progress-track"><i style={{ width: `${project.progress}%`, background: project.color }} /></div><footer><span>预估 {project.estimateHours.toFixed(1)}h</span><span>实际 {project.actualHours.toFixed(1)}h</span><span>测试 {project.testingTaskCount}/{project.total}</span><strong className={project.deviation > 10 ? "risk" : ""}>{project.deviation > 0 ? "+" : ""}{project.deviation}%</strong></footer></div>
                  </div>
                ))}
              </div>
              {data.projectDelivery.length > 0 && (
                <PaginationControls
                  page={projectPagination.page}
                  pageSize={projectPagination.pageSize}
                  total={data.projectDelivery.length}
                  itemLabel="个项目"
                  onPageChange={projectPagination.setPage}
                  onPageSizeChange={projectPagination.changePageSize}
                />
              )}
            </article>
            <article className="module-card member-report-card">
              <header className="module-card-header"><div><span className="eyebrow">成员负载</span><h3>投入与利用率</h3></div><Users2 size={18} /></header>
              <div className="member-report-list">
                {data.memberLoad.length ? memberPagination.pageItems.map((member) => (
                  <div key={member.id}><span className="avatar">{member.name.slice(0, 1)}</span><div><header><b>{member.name} · {roleLabels[member.role]}</b><span>{member.hours.toFixed(1)}h · {member.projectCount} 个项目</span></header><div className="progress-track"><i style={{ width: `${Math.min(100, member.utilization)}%` }} /></div></div><strong className={member.utilization > 100 ? "risk" : ""}>{member.utilization}%</strong></div>
                )) : <div className="module-empty"><Gauge size={24} /> 当前周期暂无成员工时</div>}
              </div>
              {data.memberLoad.length > 0 && (
                <PaginationControls
                  page={memberPagination.page}
                  pageSize={memberPagination.pageSize}
                  total={data.memberLoad.length}
                  itemLabel="位成员"
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
