CREATE UNIQUE INDEX "role_definitions_id_base_role_unique" ON "role_definitions" USING btree ("id","base_role");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_definition_base_role_fk" FOREIGN KEY ("role_definition_id","role") REFERENCES "public"."role_definitions"("id","base_role") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_definitions" ADD CONSTRAINT "role_definitions_permissions_check" CHECK (jsonb_typeof("role_definitions"."permissions") = 'object'
        and "role_definitions"."permissions" ?& array['manageProjects', 'manageUsers', 'manageTasks', 'approveWorkLogs', 'exportReports', 'viewAudit']
        and jsonb_typeof("role_definitions"."permissions"->'manageProjects') = 'boolean'
        and jsonb_typeof("role_definitions"."permissions"->'manageUsers') = 'boolean'
        and jsonb_typeof("role_definitions"."permissions"->'manageTasks') = 'boolean'
        and jsonb_typeof("role_definitions"."permissions"->'approveWorkLogs') = 'boolean'
        and jsonb_typeof("role_definitions"."permissions"->'exportReports') = 'boolean'
        and jsonb_typeof("role_definitions"."permissions"->'viewAudit') = 'boolean');--> statement-breakpoint
ALTER TABLE "role_definitions" ADD CONSTRAINT "role_definitions_tone_check" CHECK ("role_definitions"."tone" in ('violet', 'blue', 'green', 'orange', 'gray'));
