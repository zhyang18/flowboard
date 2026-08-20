import type { Metadata } from "next";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { projects, tasks, users } from "@/db/schema";
import { projectVisibilityCondition } from "@/lib/authorization";
import { getCurrentUser } from "@/lib/session";
import WorkbenchView, {
  type WorkbenchFocusTask,
  type WorkbenchProjectMetric,
} from "./workbench-view";

export const metadata: Metadata = { title: "工作台" };
export const dynamic = "force-dynamic";

const assigneeUsers = alias(users, "workbench_assignee_users");
const testerUsers = alias(users, "workbench_tester_users");

/**
 * 渲染当前用户权限范围内的工作台服务端数据加载入口。
 *
 * @return 工作台页面组件。
 */
export default async function WorkbenchPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;
  const db = getDb();
  const [projectRows, taskRows] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.archived, false),
          projectVisibilityCondition(currentUser, projects.id),
        ),
      )
      .orderBy(asc(projects.dueDate)),
    db
      .select({
        task: tasks,
        projectName: projects.name,
        projectCode: projects.code,
        projectColor: projects.color,
        assigneeName: assigneeUsers.name,
        testerName: testerUsers.name,
        overdue: sql<boolean>`${tasks.status} <> 'done' and ${tasks.dueDate} < now()`,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(assigneeUsers, eq(tasks.assigneeId, assigneeUsers.id))
      .leftJoin(testerUsers, eq(tasks.testerId, testerUsers.id))
      .where(
        and(
          eq(projects.archived, false),
          projectVisibilityCondition(currentUser, tasks.projectId),
        ),
      )
      .orderBy(desc(tasks.updatedAt)),
  ]);

  const totalTasks = taskRows.length;
  const doneTasks = taskRows.filter(({ task }) => task.status === "done").length;
  const activeTasks = taskRows.filter(({ task }) =>
    ["todo", "in_progress", "review"].includes(task.status),
  ).length;
  const overdueTasks = taskRows.filter(({ overdue }) => overdue).length;
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

  const projectMetrics: WorkbenchProjectMetric[] = projectRows.map((project) => {
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
      id: project.id,
      name: project.name,
      code: project.code,
      color: project.color,
      status: project.status,
      dueDate: project.dueDate ? project.dueDate.toISOString() : null,
      total: projectTasks.length,
      done,
      estimate,
      actual,
      progress: projectTasks.length
        ? Math.round((done / projectTasks.length) * 100)
        : 0,
    };
  });

  const focusTasks: WorkbenchFocusTask[] = taskRows
    .filter(({ task }) => task.status !== "done")
    .sort((a, b) => {
      const priority = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priority[a.task.priority] - priority[b.task.priority];
    })
    .slice(0, 6)
    .map((item) => ({
      task: {
        id: item.task.id,
        title: item.task.title,
        priority: item.task.priority,
        status: item.task.status,
        estimateHours: item.task.estimateHours,
        actualHours: item.task.actualHours,
      },
      projectName: item.projectName,
      projectCode: item.projectCode,
      projectColor: item.projectColor,
      assigneeName: item.assigneeName,
      testerName: item.testerName,
    }));

  return (
    <WorkbenchView
      projectRowsCount={projectRows.length}
      activeProjectsCount={
        projectRows.filter((p) => p.status === "active").length
      }
      activeTasks={activeTasks}
      doneTasks={doneTasks}
      totalTasks={totalTasks}
      overdueTasks={overdueTasks}
      estimateHours={estimateHours}
      actualHours={actualHours}
      completionRate={completionRate}
      hourDeviation={hourDeviation}
      projectMetrics={projectMetrics}
      focusTasks={focusTasks}
    />
  );
}
