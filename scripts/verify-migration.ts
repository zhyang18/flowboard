import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

loadEnvConfig(process.cwd());

/**
 * 只读验证角色、项目成员、工时汇总和数据库约束是否已正确上线。
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
        roleDefinitionsTable: boolean;
        loginRateLimitsTable: boolean;
        testerColumn: boolean;
        testerRoleValues: number;
        requiredConstraints: number;
        requiredRoleConstraints: number;
        requiredRoleIndexes: number;
        workLogApprovalColumns: number;
        requiredWorkLogApprovalConstraints: number;
        requiredWorkLogApprovalIndexes: number;
        requiredSprintIndexes: number;
        collaborationTables: number;
        activeUserCount: number;
        roleDefinitionCount: number;
        invalidUserRoleDefinitions: number;
        invalidRolePermissions: number;
        invalidTaskRoleAssignments: number;
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
        to_regclass('public.role_definitions') is not null as "roleDefinitionsTable",
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
            'attachments_size_bytes_check',
            'attachments_single_owner_check',
            'tasks_estimate_hours_check',
            'tasks_actual_hours_check',
            'tasks_sprint_project_fk',
            'work_logs_duration_hours_check'
          )
        ) as "requiredConstraints",
        (
          select count(*)::int
          from pg_constraint
          where conname in (
            'users_role_definition_base_role_fk',
            'role_definitions_permissions_check',
            'role_definitions_tone_check'
          )
        ) as "requiredRoleConstraints",
        (
          select count(*)::int
          from pg_indexes
          where schemaname = 'public'
            and indexname = 'role_definitions_id_base_role_unique'
        ) as "requiredRoleIndexes",
        (
          select count(*)::int
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'work_logs'
            and column_name in (
              'approval_status',
              'approved_by',
              'approved_at',
              'approval_comment'
            )
        ) as "workLogApprovalColumns",
        (
          select count(*)::int
          from pg_constraint
          where conname = 'work_logs_approved_by_users_id_fk'
        ) as "requiredWorkLogApprovalConstraints",
        (
          select count(*)::int
          from pg_indexes
          where schemaname = 'public'
            and indexname = 'work_logs_approval_status_idx'
        ) as "requiredWorkLogApprovalIndexes",
        (
          select count(*)::int
          from pg_indexes
          where schemaname = 'public'
            and indexname in (
              'sprints_id_project_unique',
              'sprints_one_active_per_project'
            )
        ) as "requiredSprintIndexes",
        (
          select count(*)::int
          from pg_class
          inner join pg_namespace on pg_namespace.oid = pg_class.relnamespace
          where pg_namespace.nspname = 'public'
            and pg_class.relkind = 'r'
            and pg_class.relname in ('attachments', 'notifications', 'task_rejections')
        ) as "collaborationTables",
        (select count(*)::int from users where status = 'active') as "activeUserCount",
        (select count(*)::int from role_definitions) as "roleDefinitionCount",
        (
          select count(*)::int
          from users
          left join role_definitions on role_definitions.id = users.role_definition_id
          where role_definitions.id is null or role_definitions.base_role <> users.role
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
        ) as "invalidTaskRoleAssignments",
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
      summary.roleDefinitionsTable &&
      summary.loginRateLimitsTable &&
      summary.testerColumn &&
      summary.testerRoleValues === 2 &&
      summary.requiredConstraints === 8 &&
      summary.requiredRoleConstraints === 3 &&
      summary.requiredRoleIndexes === 1 &&
      summary.workLogApprovalColumns === 4 &&
      summary.requiredWorkLogApprovalConstraints === 1 &&
      summary.requiredWorkLogApprovalIndexes === 1 &&
      summary.requiredSprintIndexes === 2 &&
      summary.collaborationTables === 3 &&
      summary.roleDefinitionCount >= 5 &&
      summary.invalidUserRoleDefinitions === 0 &&
      summary.invalidRolePermissions === 0 &&
      summary.invalidTaskRoleAssignments === 0 &&
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
