-- Template install, seeding, seed reconcile and the platform schedule sweep look
-- up an organization's install of a template by `sourceTemplateId`. Only
-- installed rows carry one. Build without blocking workflow writes; keep this
-- as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflows_source_template_idx"
  ON "workflows" ("organizationId", "sourceTemplateId")
  WHERE "sourceTemplateId" IS NOT NULL;
