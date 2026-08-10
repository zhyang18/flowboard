import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

loadEnvConfig(process.cwd());

/**
 * 只读验证项目成员、工时汇总和数据库约束是否已正确上线。
 *
 * @return 验证完成后的 Promise；发现缺失对象或关联异常时抛出错误。
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
        projectMembersTable: boolean;
        loginRateLimitsTable: boolean;
        testerColumn: boolean;
        testerRoleValues: number;
        requiredConstraints: number;
        activeUserCount: number;
        projectMemberCount: number;
        activeProjectCount: number;
        sprintCount: number;
        taskCount: number;
        workLogCount: number;
        loggedHours: number;
        taskActualHours: number;
        missingOwnerManagers: number;
        duplicateActiveSprintGroups: number;
        invalidTaskAssignees: number;
        invalidTaskTesters: number;
        detachedTaskReporters: number;
        detachedWorkLogUsers: number;
        crossProjectSprintTasks: number;
        taskActualHourMismatches: number;
      }>
    >`
      select
        to_regclass('public.project_members') is not null as "projectMembersTable",
        to_regclass('public.login_rate_limits') is not null as "loginRateLimitsTable",
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'tasks'
            and column_name = 'tester_id'
        ) as "testerColumn",
        (
          select count(*)::int
          from pg_enum
          inner join pg_type on pg_type.oid = pg_enum.enumtypid
          where pg_type.typname in ('user_role', 'project_member_role')
            and pg_enum.enumlabel = 'tester'
        ) as "testerRoleValues",
        (
          select count(*)::int
          from pg_constraint
          where conname in (
            'sprints_capacity_hours_check',
            'sprints_dates_check',
            'tasks_estimate_hours_check',
            'tasks_actual_hours_check',
            'work_logs_duration_hours_check'
          )
        ) as "requiredConstraints",
        (select count(*)::int from users where status = 'active') as "activeUserCount",
        (select count(*)::int from project_members) as "projectMemberCount",
        (select count(*)::int from projects where archived = false) as "activeProjectCount",
        (select count(*)::int from sprints) as "sprintCount",
        (select count(*)::int from tasks) as "taskCount",
        (select count(*)::int from work_logs) as "workLogCount",
        (select coalesce(sum(duration_hours), 0)::float8 from work_logs) as "loggedHours",
        (select coalesce(sum(actual_hours), 0)::float8 from tasks) as "taskActualHours",
        (
          select count(*)::int
          from projects
          left join project_members
            on project_members.project_id = projects.id
            and project_members.user_id = projects.owner_id
            and project_members.role = 'manager'
          where projects.archived = false and project_members.user_id is null
        ) as "missingOwnerManagers",
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
          from tasks
          left join project_members
            on project_members.project_id = tasks.project_id
            and project_members.user_id = tasks.assignee_id
          left join users on users.id = tasks.assignee_id
          where tasks.assignee_id is not null
            and tasks.status <> 'done'
            and (
              project_members.user_id is null
              or project_members.role not in ('manager', 'member')
              or users.status <> 'active'
              or users.role in ('tester', 'viewer')
            )
        ) as "invalidTaskAssignees",
        (
          select count(*)::int
          from tasks
          left join project_members
            on project_members.project_id = tasks.project_id
            and project_members.user_id = tasks.tester_id
          left join users on users.id = tasks.tester_id
          where tasks.tester_id is not null
            and tasks.status <> 'done'
            and (
              project_members.user_id is null
              or project_members.role <> 'tester'
              or users.status <> 'active'
              or users.role <> 'tester'
            )
        ) as "invalidTaskTesters",
        (
          select count(*)::int
          from tasks
          left join project_members
            on project_members.project_id = tasks.project_id
            and project_members.user_id = tasks.reporter_id
          where project_members.user_id is null
        ) as "detachedTaskReporters",
        (
          select count(*)::int
          from work_logs
          inner join tasks on tasks.id = work_logs.task_id
          left join project_members
            on project_members.project_id = tasks.project_id
            and project_members.user_id = work_logs.user_id
          where project_members.user_id is null
        ) as "detachedWorkLogUsers",
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

    const verified =
      summary.projectMembersTable &&
      summary.loginRateLimitsTable &&
      summary.testerColumn &&
      summary.testerRoleValues === 2 &&
      summary.requiredConstraints === 5 &&
      summary.missingOwnerManagers === 0 &&
      summary.duplicateActiveSprintGroups === 0 &&
      summary.invalidTaskAssignees === 0 &&
      summary.invalidTaskTesters === 0 &&
      summary.crossProjectSprintTasks === 0 &&
      Math.abs(summary.loggedHours - summary.taskActualHours) <= 0.01 &&
      summary.taskActualHourMismatches === 0;

    console.log(JSON.stringify({ verified, ...summary }, null, 2));
    if (!verified) throw new Error("Migration verification found database inconsistencies.");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
