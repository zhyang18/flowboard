import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "project_admin",
  "member",
  "viewer",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "disabled",
  "invited",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "paused",
  "completed",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const sprintStatusEnum = pgEnum("sprint_status", [
  "planned",
  "active",
  "completed",
]);

export const projectMemberRoleEnum = pgEnum("project_member_role", [
  "manager",
  "member",
  "viewer",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    department: text("department").notNull().default("研发中心"),
    team: text("team").notNull().default("平台研发组"),
    role: userRoleEnum("role").notNull().default("member"),
    status: userStatusEnum("status").notNull().default("invited"),
    passwordHash: text("password_hash"),
    projectCount: integer("project_count").notNull().default(0),
    capacity: integer("capacity").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_department_idx").on(table.department),
    index("users_status_idx").on(table.status),
    index("users_created_at_idx").on(table.createdAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_occurred_at_idx").on(table.occurredAt),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("#2f7df6"),
    status: projectStatusEnum("status").notNull().default("planning"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_code_unique").on(table.code),
    index("projects_owner_idx").on(table.ownerId),
    index("projects_status_idx").on(table.status),
    index("projects_due_date_idx").on(table.dueDate),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectMemberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "project_members_project_user_pk",
      columns: [table.projectId, table.userId],
    }),
    index("project_members_user_idx").on(table.userId),
    index("project_members_project_role_idx").on(table.projectId, table.role),
  ],
);

export const sprints = pgTable(
  "sprints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    goal: text("goal").notNull().default(""),
    status: sprintStatusEnum("status").notNull().default("planned"),
    capacityHours: real("capacity_hours").notNull().default(0),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sprints_project_idx").on(table.projectId),
    index("sprints_status_idx").on(table.status),
    index("sprints_dates_idx").on(table.startDate, table.endDate),
    uniqueIndex("sprints_project_name_unique").on(table.projectId, table.name),
    check("sprints_capacity_hours_check", sql`${table.capacityHours} >= 0`),
    check("sprints_dates_check", sql`${table.endDate} >= ${table.startDate}`),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sprintId: uuid("sprint_id").references(() => sprints.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatusEnum("status").notNull().default("backlog"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    estimateHours: real("estimate_hours").notNull().default(0),
    actualHours: real("actual_hours").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tasks_project_idx").on(table.projectId),
    index("tasks_sprint_idx").on(table.sprintId),
    index("tasks_status_order_idx").on(
      table.projectId,
      table.status,
      table.sortOrder,
    ),
    index("tasks_assignee_idx").on(table.assigneeId),
    index("tasks_due_date_idx").on(table.dueDate),
    check("tasks_estimate_hours_check", sql`${table.estimateHours} >= 0`),
    check("tasks_actual_hours_check", sql`${table.actualHours} >= 0`),
  ],
);

export const workLogs = pgTable(
  "work_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    workDate: timestamp("work_date", { withTimezone: true }).notNull(),
    durationHours: real("duration_hours").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("work_logs_task_idx").on(table.taskId),
    index("work_logs_user_date_idx").on(table.userId, table.workDate),
    index("work_logs_work_date_idx").on(table.workDate),
    check(
      "work_logs_duration_hours_check",
      sql`${table.durationHours} > 0 and ${table.durationHours} <= 24`,
    ),
  ],
);

export const loginRateLimits = pgTable(
  "login_rate_limits",
  {
    key: text("key").primaryKey(),
    failures: integer("failures").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("login_rate_limits_blocked_until_idx").on(table.blockedUntil)],
);

export const workspaceSettings = pgTable("workspace_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceName: text("workspace_name")
    .notNull()
    .default("FlowBoard 研发中心"),
  timezone: text("timezone").notNull().default("Asia/Singapore"),
  weekStart: integer("week_start").notNull().default(1),
  defaultEstimateHours: real("default_estimate_hours").notNull().default(4),
  workdayHours: real("workday_hours").notNull().default(8),
  requireEstimate: boolean("require_estimate").notNull().default(true),
  autoCompleteTimestamp: boolean("auto_complete_timestamp")
    .notNull()
    .default(true),
  notifyOverdue: boolean("notify_overdue").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type ProjectMember = typeof projectMembers.$inferSelect;
export type ProjectMemberRole =
  (typeof projectMemberRoleEnum.enumValues)[number];
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number];
export type Sprint = typeof sprints.$inferSelect;
export type NewSprint = typeof sprints.$inferInsert;
export type SprintStatus = (typeof sprintStatusEnum.enumValues)[number];
export type WorkLog = typeof workLogs.$inferSelect;
export type NewWorkLog = typeof workLogs.$inferInsert;
export type WorkspaceSettings = typeof workspaceSettings.$inferSelect;
