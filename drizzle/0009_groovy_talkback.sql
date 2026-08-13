CREATE TYPE "public"."work_log_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "approval_status" "work_log_approval_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_logs" ADD COLUMN "approval_comment" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_logs_approval_status_idx" ON "work_logs" USING btree ("approval_status");