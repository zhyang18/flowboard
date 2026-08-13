CREATE TABLE "role_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"base_role" "user_role" DEFAULT 'member' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tone" text DEFAULT 'blue' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "role_definitions" ("id", "code", "name", "description", "base_role", "permissions", "tone", "is_system") VALUES
  ('00000000-0000-4000-8000-000000000001', 'super_admin', '超级管理员', '管理组织、权限、审计及全部项目', 'super_admin', '{"manageProjects":true,"manageUsers":true,"manageTasks":true,"approveWorkLogs":true,"exportReports":true,"viewAudit":true}'::jsonb, 'violet', true),
  ('00000000-0000-4000-8000-000000000002', 'project_admin', '项目管理员', '管理指定项目、成员、迭代和报表', 'project_admin', '{"manageProjects":true,"manageUsers":true,"manageTasks":true,"approveWorkLogs":true,"exportReports":true,"viewAudit":false}'::jsonb, 'blue', true),
  ('00000000-0000-4000-8000-000000000003', 'member', '研发成员', '处理任务、记录工时并参与项目协作', 'member', '{"manageProjects":false,"manageUsers":false,"manageTasks":true,"approveWorkLogs":false,"exportReports":false,"viewAudit":false}'::jsonb, 'green', true),
  ('00000000-0000-4000-8000-000000000004', 'tester', '测试人员', '负责迭代验证、任务验收并登记测试工时', 'tester', '{"manageProjects":false,"manageUsers":false,"manageTasks":true,"approveWorkLogs":false,"exportReports":false,"viewAudit":false}'::jsonb, 'violet', true),
  ('00000000-0000-4000-8000-000000000005', 'viewer', '只读访客', '查看获授权的项目与公开报表', 'viewer', '{"manageProjects":false,"manageUsers":false,"manageTasks":false,"approveWorkLogs":false,"exportReports":false,"viewAudit":false}'::jsonb, 'gray', true);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role_definition_id" uuid DEFAULT '00000000-0000-4000-8000-000000000003' NOT NULL;--> statement-breakpoint
UPDATE "users" SET "role_definition_id" = CASE "role"
  WHEN 'super_admin' THEN '00000000-0000-4000-8000-000000000001'::uuid
  WHEN 'project_admin' THEN '00000000-0000-4000-8000-000000000002'::uuid
  WHEN 'tester' THEN '00000000-0000-4000-8000-000000000004'::uuid
  WHEN 'viewer' THEN '00000000-0000-4000-8000-000000000005'::uuid
  ELSE '00000000-0000-4000-8000-000000000003'::uuid
END;--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_code_unique" ON "role_definitions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "role_definitions_system_created_idx" ON "role_definitions" USING btree ("is_system","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_definition_id_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."role_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_role_definition_idx" ON "users" USING btree ("role_definition_id");
