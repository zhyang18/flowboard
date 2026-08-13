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
        duplicateActiveSprintGroups: number;
        invalidSprints: number;
        invalidTasks: number;
        invalidWorkLogs: number;
        invalidProjectOwners: number;
        crossProjectSprintTasks: number;
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
          from (
            select project_id
            from sprints
            where status = 'active'
            group by project_id
            having count(*) > 1
          ) duplicate_active_sprints
        ) as "duplicateActiveSprintGroups",
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
            and (users.status <> 'active' or users.role in ('viewer', 'tester'))
        ) as "invalidProjectOwners",
        (
          select count(*)::int
          from tasks
          inner join sprints on sprints.id = tasks.sprint_id
          where tasks.project_id <> sprints.project_id
        ) as "crossProjectSprintTasks",
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

    const [roleSchema] = await sql<
      Array<{ available: boolean }>
    >`
      select
        to_regclass('public.role_definitions') is not null
        and exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'users'
            and column_name = 'role_definition_id'
        ) as available
    `;
    let invalidUserRoleDefinitions = 0;
    let invalidRolePermissions = 0;
    let invalidTaskRoleAssignments = 0;
    if (roleSchema.available) {
      const [roleSummary] = await sql<
        Array<{
          invalidUserRoleDefinitions: number;
          invalidRolePermissions: number;
          invalidTaskRoleAssignments: number;
        }>
      >`
        select
          (
            select count(*)::int
            from users
            left join role_definitions
              on role_definitions.id = users.role_definition_id
            where role_definitions.id is null
              or role_definitions.base_role <> users.role
          ) as "invalidUserRoleDefinitions",
          (
            select count(*)::int
            from role_definitions
            where jsonb_typeof(permissions) <> 'object'
              or not permissions ?& array[
                'manageProjects',
                'manageUsers',
                'manageTasks',
                'approveWorkLogs',
                'exportReports',
                'viewAudit'
              ]
              or jsonb_typeof(permissions->'manageProjects') <> 'boolean'
              or jsonb_typeof(permissions->'manageUsers') <> 'boolean'
              or jsonb_typeof(permissions->'manageTasks') <> 'boolean'
              or jsonb_typeof(permissions->'approveWorkLogs') <> 'boolean'
              or jsonb_typeof(permissions->'exportReports') <> 'boolean'
              or jsonb_typeof(permissions->'viewAudit') <> 'boolean'
              or tone not in ('violet', 'blue', 'green', 'orange', 'gray')
          ) as "invalidRolePermissions",
          (
            select count(*)::int
            from tasks
            left join users assignees on assignees.id = tasks.assignee_id
            left join role_definitions assignee_roles
              on assignee_roles.id = assignees.role_definition_id
            left join users testers on testers.id = tasks.tester_id
            left join role_definitions tester_roles
              on tester_roles.id = testers.role_definition_id
            where tasks.status <> 'done'
              and (
                (tasks.assignee_id is not null and coalesce((assignee_roles.permissions->>'manageTasks')::boolean, false) = false)
                or (tasks.tester_id is not null and coalesce((tester_roles.permissions->>'manageTasks')::boolean, false) = false)
              )
          ) as "invalidTaskRoleAssignments"
      `;
      invalidUserRoleDefinitions = roleSummary.invalidUserRoleDefinitions;
      invalidRolePermissions = roleSummary.invalidRolePermissions;
      invalidTaskRoleAssignments = roleSummary.invalidTaskRoleAssignments;
    }

    const blockers =
      summary.duplicateSprintGroups +
      summary.duplicateActiveSprintGroups +
      summary.invalidSprints +
      summary.invalidTasks +
      summary.invalidWorkLogs +
      summary.invalidProjectOwners +
      summary.crossProjectSprintTasks +
      invalidUserRoleDefinitions +
      invalidRolePermissions +
      invalidTaskRoleAssignments;
    console.log(
      JSON.stringify(
        {
          migrationReady: blockers === 0,
          blockers,
          ...summary,
          roleSchemaAvailable: roleSchema.available,
          invalidUserRoleDefinitions,
          invalidRolePermissions,
          invalidTaskRoleAssignments,
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
