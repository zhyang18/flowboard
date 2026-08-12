import type { Metadata } from "next";
import TimeAnalysis from "./time-analysis";

export const metadata: Metadata = { title: "工时分析" };

/**
 * 渲染工时分析页，并把任务快捷登记深链传给表单。
 *
 * @param searchParams 当前页面查询参数。
 * @return 工时分析页面。
 */
export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string | string[] }>;
}) {
  const taskId = (await searchParams).taskId;
  return <TimeAnalysis initialTaskId={typeof taskId === "string" ? taskId : ""} />;
}
