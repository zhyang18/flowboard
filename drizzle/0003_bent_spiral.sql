CREATE TYPE "public"."project_member_role" AS ENUM('manager', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE "login_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "project_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_user_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_rate_limits_blocked_until_idx" ON "login_rate_limits" USING btree ("blocked_until");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_members_project_role_idx" ON "project_members" USING btree ("project_id","role");--> statement-breakpoint
INSERT INTO "project_members" ("project_id", "user_id", "role")
SELECT "id", "owner_id", 'manager'::"project_member_role"
FROM "projects"
ON CONFLICT ("project_id", "user_id") DO UPDATE
SET "role" = 'manager'::"project_member_role", "updated_at" = now();--> statement-breakpoint
INSERT INTO "project_members" ("project_id", "user_id", "role")
SELECT DISTINCT associations."project_id", associations."user_id",
	CASE WHEN "users"."role" = 'viewer' THEN 'viewer'::"project_member_role" ELSE 'member'::"project_member_role" END
FROM (
	SELECT "project_id", "assignee_id" AS "user_id" FROM "tasks" WHERE "assignee_id" IS NOT NULL
	UNION
	SELECT "project_id", "reporter_id" AS "user_id" FROM "tasks"
	UNION
	SELECT "tasks"."project_id", "work_logs"."user_id"
	FROM "work_logs"
	INNER JOIN "tasks" ON "tasks"."id" = "work_logs"."task_id"
) associations
INNER JOIN "users" ON "users"."id" = associations."user_id"
ON CONFLICT ("project_id", "user_id") DO NOTHING;--> statement-breakpoint
UPDATE "tasks"
SET "actual_hours" = COALESCE((
	SELECT SUM("work_logs"."duration_hours")
	FROM "work_logs"
	WHERE "work_logs"."task_id" = "tasks"."id"
), 0), "updated_at" = now();--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "sprints" GROUP BY "project_id", "name" HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Duplicate sprint names exist in the same project; resolve them before applying this migration.';
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_project_name_unique" ON "sprints" USING btree ("project_id","name");--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_capacity_hours_check" CHECK ("sprints"."capacity_hours" >= 0);--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_dates_check" CHECK ("sprints"."end_date" >= "sprints"."start_date");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_estimate_hours_check" CHECK ("tasks"."estimate_hours" >= 0);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_actual_hours_check" CHECK ("tasks"."actual_hours" >= 0);--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_duration_hours_check" CHECK ("work_logs"."duration_hours" > 0 and "work_logs"."duration_hours" <= 24);
