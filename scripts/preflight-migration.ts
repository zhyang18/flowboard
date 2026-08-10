import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

loadEnvConfig(process.cwd());

/**
 * 只读检查生产数据是否满足当前迁移约束。
 *
 * @return 检查完成后的 Promise；存在阻断项时抛出错误。
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    connect_timeout: 30,
  });
  try {
    const [summary] = await sql<
      Array<{
        duplicateSprintGroups: number;
        invalidSprints: number;
        invalidTasks: number;
        invalidWorkLogs: number;
        invalidProjectOwners: number;
        taskActualHourMismatches: number;
      }>
    >`
      select
        (
          select count(*)::int
          from (
            select project_id, name
            from sprints
            group by project_id, name
            having count(*) > 1
          ) duplicates
        ) as "duplicateSprintGroups",
        (
          select count(*)::int
          from sprints
          where capacity_hours < 0 or end_date < start_date
        ) as "invalidSprints",
        (
          select count(*)::int
          from tasks
          where estimate_hours < 0 or actual_hours < 0
        ) as "invalidTasks",
        (
          select count(*)::int
          from work_logs
          where duration_hours <= 0 or duration_hours > 24
        ) as "invalidWorkLogs",
        (
          select count(*)::int
          from projects
          inner join users on users.id = projects.owner_id
          where projects.archived = false
            and (users.status <> 'active' or users.role = 'viewer')
        ) as "invalidProjectOwners",
        (
          select count(*)::int
          from tasks
          where abs(
            actual_hours - coalesce((
              select sum(work_logs.duration_hours)
              from work_logs
              where work_logs.task_id = tasks.id
            ), 0)
          ) > 0.01
        ) as "taskActualHourMismatches"
    `;

    const blockers =
      summary.duplicateSprintGroups +
      summary.invalidSprints +
      summary.invalidTasks +
      summary.invalidWorkLogs +
      summary.invalidProjectOwners;
    console.log(
      JSON.stringify(
        {
          migrationReady: blockers === 0,
          blockers,
          ...summary,
          note:
            summary.taskActualHourMismatches > 0
              ? "迁移会按工时明细自动校准任务实际工时。"
              : "任务实际工时与明细一致。",
        },
        null,
        2,
      ),
    );
    if (blockers > 0) {
      throw new Error("Migration preflight found blocking data issues.");
    }
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
