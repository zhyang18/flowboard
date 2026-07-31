import type { Metadata } from "next";
import ProjectManagement from "./project-management";

export const metadata: Metadata = { title: "项目" };

export default function ProjectsPage() {
  return <ProjectManagement />;
}
