import type { Metadata } from "next";
import TaskBoard from "./task-board";

export const metadata: Metadata = { title: "任务看板" };

export default function BoardPage() {
  return <TaskBoard />;
}
