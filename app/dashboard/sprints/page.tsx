import type { Metadata } from "next";
import SprintManagement from "./sprint-management";

export const metadata: Metadata = { title: "迭代" };

export default function SprintsPage() {
  return <SprintManagement />;
}
