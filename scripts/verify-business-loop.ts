import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import assert from "node:assert/strict";
import { getDb } from "../db";
import {
  users,
  projects,
  projectMembers,
  sprints,
  tasks,
  workLogs,
  auditLogs,
} from "../db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

async function verifyBusinessLoop() {
  console.log("Starting E2E business loop simulation...");
  const db = getDb();
  const timestamp = Date.now();
  
  try {
    // 1. Create a super admin
    const [admin] = await db.insert(users).values({
      name: `Admin ${timestamp}`,
      email: `admin_${timestamp}@flowboard.local`,
      role: "super_admin",
      status: "active",
      passwordHash: crypto.randomBytes(32).toString("hex"),
    }).returning();
    console.log(`Created admin user: ${admin.id}`);

    // 2. Create a project manager, a dev, and a tester
    const [manager] = await db.insert(users).values({
      name: `Manager ${timestamp}`,
      email: `manager_${timestamp}@flowboard.local`,
      role: "project_admin",
      status: "active",
    }).returning();
    
    const [dev] = await db.insert(users).values({
      name: `Dev ${timestamp}`,
      email: `dev_${timestamp}@flowboard.local`,
      role: "member",
      status: "active",
    }).returning();

    const [tester] = await db.insert(users).values({
      name: `Tester ${timestamp}`,
      email: `tester_${timestamp}@flowboard.local`,
      role: "tester",
      status: "active",
    }).returning();
    console.log(`Created manager, dev, and tester users`);

    // 3. Admin creates a project
    const [project] = await db.insert(projects).values({
      name: `Test Project ${timestamp}`,
      code: `PROJ-${timestamp}`,
      ownerId: manager.id, // Manager owns the project
      status: "planning",
    }).returning();
    console.log(`Created project: ${project.id}`);

    // 4. Add members to the project
    await db.insert(projectMembers).values([
      { projectId: project.id, userId: manager.id, role: "manager" },
      { projectId: project.id, userId: dev.id, role: "member" },
      { projectId: project.id, userId: tester.id, role: "tester" },
    ]);
    console.log(`Added members to project`);

    // 5. Manager creates a sprint
    const [sprint] = await db.insert(sprints).values({
      projectId: project.id,
      name: `Sprint 1 - ${timestamp}`,
      status: "planned",
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
    }).returning();
    console.log(`Created sprint: ${sprint.id}`);

    // 6. Dev creates a task, assigns to self, tester to tester
    const [task] = await db.insert(tasks).values({
      projectId: project.id,
      sprintId: sprint.id,
      title: `E2E Feature ${timestamp}`,
      status: "todo",
      assigneeId: dev.id,
      testerId: tester.id,
      reporterId: dev.id,
      estimateHours: 8,
    }).returning();
    console.log(`Created task: ${task.id}`);

    // 7. Start the sprint
    await db.update(sprints).set({ status: "active" }).where(eq(sprints.id, sprint.id));
    console.log(`Started sprint`);

    // 8. Dev moves task to in_progress
    await db.update(tasks).set({ status: "in_progress" }).where(eq(tasks.id, task.id));
    console.log(`Task moved to in_progress`);

    // 9. Dev logs work
    await db.insert(workLogs).values({
      taskId: task.id,
      userId: dev.id,
      workDate: new Date(),
      durationHours: 4,
      note: "Worked on frontend",
    });
    // Manual sync for simulation (normally done in API transaction)
    await db.update(tasks).set({ actualHours: 4 }).where(eq(tasks.id, task.id));
    console.log(`Logged work on task`);

    // 10. Dev moves task to review
    await db.update(tasks).set({ status: "review" }).where(eq(tasks.id, task.id));
    console.log(`Task moved to review`);

    // 11. Tester approves and moves to done
    await db.update(tasks).set({ status: "done", completedAt: new Date() }).where(eq(tasks.id, task.id));
    console.log(`Task moved to done`);

    // 12. Manager completes sprint
    await db.update(sprints).set({ status: "completed" }).where(eq(sprints.id, sprint.id));
    console.log(`Completed sprint`);

    // 13. Manager archives project
    await db.update(projects).set({ archived: true }).where(eq(projects.id, project.id));
    console.log(`Archived project`);

    console.log("E2E business loop simulation completed successfully!");
  } catch (error) {
    console.error("E2E simulation failed:", error);
    process.exit(1);
  } finally {
    // Cleanup generated data using the project timestamp code
    const [project] = await db.select().from(projects).where(eq(projects.code, `PROJ-${timestamp}`));
    if (project) {
      // Manually delete work logs to respect the restrict constraint
      const taskRows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, project.id));
      const taskIds = taskRows.map((t) => t.id);
      if (taskIds.length > 0) {
        for (const taskId of taskIds) {
          await db.delete(workLogs).where(eq(workLogs.taskId, taskId));
        }
      }
      await db.delete(projects).where(eq(projects.id, project.id));
      console.log("Cleaned up simulated project.");
    }
    // Users are not cascaded by project deletion, clean them up
    await db.delete(users).where(eq(users.name, `Admin ${timestamp}`));
    await db.delete(users).where(eq(users.name, `Manager ${timestamp}`));
    await db.delete(users).where(eq(users.name, `Dev ${timestamp}`));
    await db.delete(users).where(eq(users.name, `Tester ${timestamp}`));
    console.log("Cleaned up simulated users.");
    process.exit(0);
  }
}

verifyBusinessLoop();
