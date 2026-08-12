import type { Metadata } from "next";
import TaskBoard from "./task-board";

export const metadata: Metadata = { title: "任务看板" };

/**
 * 渲染任务看板，并把消息提醒中的任务深链传给客户端。
 *
 * @param searchParams 当前页面查询参数。
 * @return 任务看板页面。
 */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string | string[] }>;
}) {
  const taskId = (await searchParams).taskId;
  return <TaskBoard initialTaskId={typeof taskId === "string" ? taskId : ""} />;
}
