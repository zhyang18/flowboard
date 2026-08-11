import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, projectMembers, projects, sprints, tasks } from "@/db/schema";
import {
  canManageProject,
  getProjectAccess,
  projectVisibilityCondition,
} from "@/lib/authorization";
import {
  apiError,
  isConstraintViolation,
  isUniqueViolation,
  textValue,
} from "@/lib/api";
import { hasTrustedOrigin } from "@/lib/request-security";
import { getCurrentUser } from "@/lib/session";
import {
  parseDate,
  safeHours,
  serializeSprint,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 获取当前用户可见的迭代及其任务进度。
 *
 * @return 迭代列表、可选项目和管理权限。
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  const db = getDb();
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      color: projects.color,
      ownerId: projects.ownerId,
      archived: projects.archived,
    })
    .from(projects)
    .where(
      and(
        eq(projects.archived, false),
        projectVisibilityCondition(currentUser, projects.id),
      ),
    )
    .orderBy(asc(projects.name));
  const projectIds = projectRows.map((project) => project.id);

  const [sprintRows, taskRows, membershipRows] = await Promise.all([
    projectIds.length
      ? db
          .select({
            sprint: sprints,
            projectName: projects.name,
            projectCode: projects.code,
            projectColor: projects.color,
          })
          .from(sprints)
          .innerJoin(projects, eq(sprints.projectId, projects.id))
          .where(inArray(sprints.projectId, projectIds))
          .orderBy(asc(sprints.startDate))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({
            id: tasks.id,
            sprintId: tasks.sprintId,
            title: tasks.title,
            status: tasks.status,
            testerId: tasks.testerId,
            estimateHours: tasks.estimateHours,
            actualHours: tasks.actualHours,
          })
          .from(tasks)
          .where(inArray(tasks.projectId, projectIds))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({ projectId: projectMembers.projectId, role: projectMembers.role })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.userId, currentUser.id),
              inArray(projectMembers.projectId, projectIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const membershipMap = new Map(
    membershipRows.map((member) => [member.projectId, member.role]),
  );
  const accessForProject = (projectId: string) => {
    const project = projectRows.find((item) => item.id === projectId);
    return project
      ? {
          projectId,
          ownerId: project.ownerId,
          archived: project.archived,
          memberRole: membershipMap.get(projectId) ?? null,
        }
      : null;
  };

  return NextResponse.json({
    data: sprintRows.map(({ sprint, ...project }) => {
      const sprintTasks = taskRows.filter((task) => task.sprintId === sprint.id);
      const done = sprintTasks.filter((task) => task.status === "done").length;
      const estimate = sprintTasks.reduce((sum, task) => sum + task.estimateHours, 0);
      const actual = sprintTasks.reduce((sum, task) => sum + task.actualHours, 0);
      return {
        ...serializeSprint(sprint),
        ...project,
        canManage: canManageProject(currentUser, accessForProject(sprint.projectId)),
        taskCount: sprintTasks.length,
        completedTaskCount: done,
        testedTaskCount: sprintTasks.filter((task) => Boolean(task.testerId)).length,
        progress: sprintTasks.length ? Math.round((done / sprintTasks.length) * 100) : 0,
        estimateHours: Math.round(estimate * 10) / 10,
        actualHours: Math.round(actual * 10) / 10,
        tasks: sprintTasks,
      };
    }),
    projects: projectRows.map(({ ownerId, archived, ...project }) => ({
      ...project,
      canManage: canManageProject(currentUser, {
        projectId: project.id,
        ownerId,
        archived,
        memberRole: membershipMap.get(project.id) ?? null,
      }),
    })),
    canCreate: projectRows.some((project) =>
      canManageProject(currentUser, accessForProject(project.id)),
    ),
  });
}

/**
 * 在用户可管理的项目中创建迭代。
 *
 * @param request 当前创建迭代请求。
 * @return 创建后的迭代记录。
 */
export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return apiError("请求来源无效。", 403);
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("请先登录。", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("请求内容不是有效的 JSON。");
  }
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const name = textValue(body.name, 80);
  const goal = textValue(body.goal, 500);
  if ("status" in body && body.status !== "planned") {
    return apiError("新迭代必须从未开始状态创建。", 409);
  }
  const status = "planned" as const;
  const capacityHours = safeHours(body.capacityHours);
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  if (!projectId || !name) return apiError("请选择项目并填写迭代名称。");
  if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
    return apiError("请填写有效的迭代周期。");
  }
  if (endDate < startDate) return apiError("结束日期不能早于开始日期。");

  const access = await getProjectAccess(currentUser, projectId);
  if (!access || access.archived) return apiError("所属项目不存在。", 404);
  if (!canManageProject(currentUser, access)) return apiError("无权创建该项目的迭代。", 403);

  try {
    const created = await getDb().transaction(async (tx) => {
      const [sprint] = await tx
        .insert(sprints)
        .values({ projectId, name, goal, status, capacityHours, startDate, endDate })
        .returning();
      await tx.insert(auditLogs).values({
        actorId: currentUser.id,
        action: "sprint.create",
        entityType: "sprint",
        entityId: sprint.id,
        metadata: { name: sprint.name, projectId: sprint.projectId },
      });
      return sprint;
    });
    return NextResponse.json({ data: serializeSprint(created) }, { status: 201 });
  } catch (error) {
    if (isConstraintViolation(error, "sprints_one_active_per_project")) {
      return apiError("同一项目只能有一个进行中的迭代。", 409);
    }
    if (isUniqueViolation(error)) return apiError("同一项目中不能存在重名迭代。", 409);
    throw error;
  }
}
