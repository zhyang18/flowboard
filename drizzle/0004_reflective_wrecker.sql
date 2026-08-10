ALTER TYPE "public"."project_member_role" ADD VALUE 'tester' BEFORE 'viewer';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'tester' BEFORE 'viewer';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "tester_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tester_id_users_id_fk" FOREIGN KEY ("tester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_tester_idx" ON "tasks" USING btree ("tester_id");