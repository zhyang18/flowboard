DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "tasks"
		INNER JOIN "sprints" ON "sprints"."id" = "tasks"."sprint_id"
		WHERE "tasks"."project_id" <> "sprints"."project_id"
	) THEN
		RAISE EXCEPTION 'Cross-project sprint tasks exist; resolve them before applying this migration.';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM "sprints"
		WHERE "status" = 'active'
		GROUP BY "project_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Multiple active sprints exist in one project; resolve them before applying this migration.';
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_id_project_unique" ON "sprints" USING btree ("id","project_id");--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_sprint_id_sprints_id_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprint_project_fk" FOREIGN KEY ("sprint_id","project_id") REFERENCES "public"."sprints"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints" USING btree ("project_id") WHERE "sprints"."status" = 'active';
