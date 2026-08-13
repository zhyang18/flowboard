import { and, eq } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { getDb } from "./index";
import {
  projects,
  projectMembers,
  sprints,
  tasks,
  users,
  workLogs,
  workspaceSettings,
} from "./schema";
import { hashPassword } from "../lib/password";

loadEnvConfig(process.cwd());

const seedDemoData = process.env.SEED_DEMO_DATA === "true";

const seedUsers = [
  {
    name: "张三",
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@flowboard.local",
    phone: "138 0000 1024",
    department: "研发中心",
    team: "平台研发组",
    role: "super_admin" as const,
    status: "active" as const,
    projectCount: 6,
    capacity: 85,
  },
  {
    name: "李四",
    email: "lisi@flowboard.local",
    phone: "138 0000 1025",
    department: "研发中心",
    team: "支付研发组",
    role: "member" as const,
    status: "active" as const,
    projectCount: 4,
    capacity: 92,
  },
  {
    name: "王五",
    email: "wangwu@flowboard.local",
    phone: "138 0000 1026",
    department: "产品中心",
    team: "电商产品组",
    role: "project_admin" as const,
    status: "active" as const,
    projectCount: 5,
    capacity: 76,
  },
  {
    name: "赵六",
    email: "zhaoliu@flowboard.local",
    phone: "138 0000 1027",
    department: "研发中心",
    team: "客户端组",
    role: "member" as const,
    status: "active" as const,
    projectCount: 3,
    capacity: 68,
  },
  {
    name: "孙七",
    email: "sunqi@flowboard.local",
    phone: "138 0000 1028",
    department: "质量中心",
    team: "测试保障组",
    role: "tester" as const,
    status: "active" as const,
    projectCount: 4,
    capacity: 81,
  },
  {
    name: "周八",
    email: "zhouba@flowboard.local",
    phone: "138 0000 1029",
    department: "设计中心",
    team: "体验设计组",
    role: "member" as const,
    status: "disabled" as const,
    projectCount: 2,
    capacity: 0,
  },
  {
    name: "吴九",
    email: "wujiu@flowboard.local",
    phone: "138 0000 1030",
    department: "数据中心",
    team: "数据平台组",
    role: "project_admin" as const,
    status: "active" as const,
    projectCount: 5,
    capacity: 73,
  },
  {
    name: "郑十",
    email: "zhengshi@flowboard.local",
    phone: "138 0000 1031",
    department: "业务中心",
    team: "运营支持组",
    role: "viewer" as const,
    status: "invited" as const,
    projectCount: 1,
    capacity: 0,
  },
];

/**
 * 初始化管理员、工作空间设置及可选的本地演示数据。
 *
 * @return 数据初始化完成后的 Promise。
 */
async function seed() {
  const db = getDb();
  if (!seedDemoData && (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD)) {
    throw new Error(
      "Production-safe seed requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD. Set SEED_DEMO_DATA=true only for local demo data.",
    );
  }
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123456";
  const adminPasswordHash = await hashPassword(adminPassword);

  const selectedSeedUsers = seedDemoData ? seedUsers : seedUsers.slice(0, 1);
  for (const [index, user] of selectedSeedUsers.entries()) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email))
      .limit(1);

    if (existing) continue;

    await db.insert(users).values({
      ...user,
      passwordHash: index === 0 ? adminPasswordHash : null,
      lastSeenAt: index < 5 ? new Date(Date.now() - index * 25 * 60 * 1000) : null,
    });
  }

  const userRows = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users);
  const userId = (email: string) =>
    userRows.find((user) => user.email === email)?.id ?? userRows[0]?.id;
  const adminId = userId(seedUsers[0].email);
  if (!adminId) throw new Error("Seed admin was not created.");

  if (!seedDemoData) {
    const [settings] = await db
      .select({ id: workspaceSettings.id })
      .from(workspaceSettings)
      .limit(1);
    if (!settings) await db.insert(workspaceSettings).values({});
    console.log("Production-safe seed complete: admin and workspace settings only.");
    return;
  }

  const projectSeeds = [
    {
      code: "FLOW",
      name: "FlowBoard 核心平台",
      description: "统一项目协作、任务流转与研发工时管理。",
      color: "#2f7df6",
      status: "active" as const,
      ownerId: adminId,
      startDate: new Date("2026-07-01T00:00:00+08:00"),
      dueDate: new Date("2026-09-30T23:59:59+08:00"),
    },
    {
      code: "MOBILE",
      name: "移动端体验升级",
      description: "优化移动端任务处理、通知和离线访问体验。",
      color: "#7657d9",
      status: "active" as const,
      ownerId: userId("zhaoliu@flowboard.local") ?? adminId,
      startDate: new Date("2026-07-15T00:00:00+08:00"),
      dueDate: new Date("2026-08-28T23:59:59+08:00"),
    },
    {
      code: "INSIGHT",
      name: "研发效能洞察",
      description: "建立交付预测、工时偏差和团队容量分析。",
      color: "#13a47b",
      status: "planning" as const,
      ownerId: userId("wujiu@flowboard.local") ?? adminId,
      startDate: new Date("2026-08-01T00:00:00+08:00"),
      dueDate: new Date("2026-10-15T23:59:59+08:00"),
    },
  ];

  for (const projectSeed of projectSeeds) {
    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.code, projectSeed.code))
      .limit(1);
    if (!existing) await db.insert(projects).values(projectSeed);
  }

  const projectRows = await db
    .select({ id: projects.id, code: projects.code, ownerId: projects.ownerId })
    .from(projects);
  const projectId = (code: string) =>
    projectRows.find((project) => project.code === code)?.id;
  const flowProjectId = projectId("FLOW");
  const mobileProjectId = projectId("MOBILE");
  const insightProjectId = projectId("INSIGHT");

  const taskSeeds = [
    {
      projectId: flowProjectId,
      title: "完成工作台核心指标聚合",
      description: "展示活跃项目、任务完成率、工时偏差与逾期风险。",
      status: "done" as const,
      priority: "high" as const,
      assigneeId: userId("lisi@flowboard.local") ?? adminId,
      testerId: userId("sunqi@flowboard.local") ?? null,
      reporterId: adminId,
      estimateHours: 8,
      actualHours: 9,
      sortOrder: 0,
      dueDate: new Date("2026-07-30T23:59:59+08:00"),
      completedAt: new Date("2026-07-30T18:20:00+08:00"),
    },
    {
      projectId: flowProjectId,
      title: "项目状态与归档流程",
      description: "支持规划、进行、暂停、完成和安全归档。",
      status: "review" as const,
      priority: "high" as const,
      assigneeId: userId("wangwu@flowboard.local") ?? adminId,
      testerId: userId("sunqi@flowboard.local") ?? null,
      reporterId: adminId,
      estimateHours: 6,
      actualHours: 7.5,
      sortOrder: 0,
      dueDate: new Date("2026-08-02T23:59:59+08:00"),
    },
    {
      projectId: flowProjectId,
      title: "任务拖拽流转与完成时间记录",
      description: "任务移动到已完成时自动记录实际完成时间。",
      status: "in_progress" as const,
      priority: "urgent" as const,
      assigneeId: userId("zhaoliu@flowboard.local") ?? adminId,
      testerId: userId("sunqi@flowboard.local") ?? null,
      reporterId: adminId,
      estimateHours: 10,
      actualHours: 6.5,
      sortOrder: 0,
      dueDate: new Date("2026-08-01T23:59:59+08:00"),
    },
    {
      projectId: mobileProjectId,
      title: "移动端底部主导航",
      description: "在手机上快速切换工作台、项目、看板和用户模块。",
      status: "todo" as const,
      priority: "medium" as const,
      assigneeId: userId("zhaoliu@flowboard.local") ?? adminId,
      testerId: userId("sunqi@flowboard.local") ?? null,
      reporterId: adminId,
      estimateHours: 4,
      actualHours: 0,
      sortOrder: 0,
      dueDate: new Date("2026-08-05T23:59:59+08:00"),
    },
    {
      projectId: insightProjectId,
      title: "定义工时偏差风险阈值",
      description: "形成预估、实际、剩余和超时风险的统一口径。",
      status: "backlog" as const,
      priority: "medium" as const,
      assigneeId: userId("wujiu@flowboard.local") ?? adminId,
      testerId: userId("sunqi@flowboard.local") ?? null,
      reporterId: adminId,
      estimateHours: 5,
      actualHours: 0,
      sortOrder: 0,
      dueDate: new Date("2026-08-15T23:59:59+08:00"),
    },
  ];

  for (const taskSeed of taskSeeds) {
    const resolvedProjectId = taskSeed.projectId;
    if (!resolvedProjectId) continue;
    const [existing] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, resolvedProjectId),
          eq(tasks.title, taskSeed.title),
        ),
      )
      .limit(1);
    if (!existing) {
      await db.insert(tasks).values({
        ...taskSeed,
        projectId: resolvedProjectId,
      });
    }
  }

  const refreshedTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      assigneeId: tasks.assigneeId,
      testerId: tasks.testerId,
      reporterId: tasks.reporterId,
    })
    .from(tasks);

  const sprintSeeds = [
    {
      projectId: flowProjectId,
      name: "Sprint 2026-08A",
      goal: "完成核心工作台、项目、任务看板与迭代闭环。",
      status: "active" as const,
      capacityHours: 40,
      startDate: new Date("2026-07-27T00:00:00+08:00"),
      endDate: new Date("2026-08-09T23:59:59+08:00"),
      taskTitles: [
        "完成工作台核心指标聚合",
        "项目状态与归档流程",
        "任务拖拽流转与完成时间记录",
      ],
    },
    {
      projectId: mobileProjectId,
      name: "Mobile Sprint 01",
      goal: "完成移动端导航和关键任务处理体验。",
      status: "planned" as const,
      capacityHours: 24,
      startDate: new Date("2026-08-10T00:00:00+08:00"),
      endDate: new Date("2026-08-23T23:59:59+08:00"),
      taskTitles: ["移动端底部主导航"],
    },
  ];

  for (const sprintSeed of sprintSeeds) {
    if (!sprintSeed.projectId) continue;
    const [existing] = await db
      .select({ id: sprints.id })
      .from(sprints)
      .where(
        and(
          eq(sprints.projectId, sprintSeed.projectId),
          eq(sprints.name, sprintSeed.name),
        ),
      )
      .limit(1);
    const sprintId = existing?.id ?? (
      await db
        .insert(sprints)
        .values({
          projectId: sprintSeed.projectId,
          name: sprintSeed.name,
          goal: sprintSeed.goal,
          status: sprintSeed.status,
          capacityHours: sprintSeed.capacityHours,
          startDate: sprintSeed.startDate,
          endDate: sprintSeed.endDate,
        })
        .returning({ id: sprints.id })
    )[0].id;
    const sprintTaskIds = refreshedTasks
      .filter(
        (task) =>
          task.projectId === sprintSeed.projectId &&
          sprintSeed.taskTitles.includes(task.title),
      )
      .map((task) => task.id);
    for (const taskId of sprintTaskIds) {
      await db
        .update(tasks)
        .set({ sprintId })
        .where(eq(tasks.id, taskId));
    }
  }

  const logSeeds = [
    {
      title: "完成工作台核心指标聚合",
      durationHours: 7.5,
      note: "完成指标聚合、进度和工时偏差展示。",
      workDate: new Date("2026-07-30T10:00:00+08:00"),
      userId: userId("lisi@flowboard.local"),
    },
    {
      title: "完成工作台核心指标聚合",
      durationHours: 1.5,
      note: "完成核心指标验收与回归测试。",
      workDate: new Date("2026-07-30T16:00:00+08:00"),
      userId: userId("sunqi@flowboard.local"),
    },
    {
      title: "项目状态与归档流程",
      durationHours: 5.5,
      note: "完成项目编辑、状态切换和安全归档。",
      workDate: new Date("2026-07-31T10:00:00+08:00"),
      userId: userId("wangwu@flowboard.local"),
    },
    {
      title: "项目状态与归档流程",
      durationHours: 2,
      note: "覆盖状态切换、归档限制和权限回归。",
      workDate: new Date("2026-07-31T13:00:00+08:00"),
      userId: userId("sunqi@flowboard.local"),
    },
    {
      title: "任务拖拽流转与完成时间记录",
      durationHours: 6.5,
      note: "实现任务拖拽和完成时间自动记录。",
      workDate: new Date("2026-07-31T14:00:00+08:00"),
      userId: userId("zhaoliu@flowboard.local"),
    },
  ];

  for (const logSeed of logSeeds) {
    const task = refreshedTasks.find((item) => item.title === logSeed.title);
    const logUserId = logSeed.userId ?? task?.assigneeId;
    if (!task || !logUserId) continue;
    const [existing] = await db
      .select({ id: workLogs.id })
      .from(workLogs)
      .where(
        and(
          eq(workLogs.taskId, task.id),
          eq(workLogs.userId, logUserId),
          eq(workLogs.workDate, logSeed.workDate),
        ),
      )
      .limit(1);
    if (!existing) {
      await db.insert(workLogs).values({
        taskId: task.id,
        userId: logUserId,
        durationHours: logSeed.durationHours,
        note: logSeed.note,
        workDate: logSeed.workDate,
      });
    }
  }

  const membershipMap = new Map<string, "manager" | "member" | "tester" | "viewer">();
  for (const project of projectRows) {
    membershipMap.set(`${project.id}:${project.ownerId}`, "manager");
  }
  for (const task of refreshedTasks) {
    for (const memberId of [task.assigneeId, task.testerId, task.reporterId]) {
      if (!memberId) continue;
      const user = userRows.find((item) => item.id === memberId);
      const key = `${task.projectId}:${memberId}`;
      if (!membershipMap.has(key)) {
        membershipMap.set(
          key,
          user?.role === "viewer" ? "viewer" : user?.role === "tester" ? "tester" : "member",
        );
      }
    }
  }
  if (membershipMap.size) {
    await db
      .insert(projectMembers)
      .values(
        [...membershipMap.entries()].map(([key, role]) => {
          const [projectId, userId] = key.split(":");
          return { projectId, userId, role };
        }),
      )
      .onConflictDoNothing();
  }

  const [settings] = await db.select({ id: workspaceSettings.id }).from(workspaceSettings).limit(1);
  if (!settings) await db.insert(workspaceSettings).values({});

  console.log(`Seed complete. Admin email: ${seedUsers[0].email}`);
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
