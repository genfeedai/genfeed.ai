ALTER TABLE "workflows" ADD COLUMN "templateInstantiationKey" TEXT,
  ADD COLUMN "templateInstantiationRequestHash" TEXT;

-- Keys remain reserved when workflows are soft-deleted. NULL keeps unkeyed creates independent.
CREATE UNIQUE INDEX "workflows_template_instantiation_scope_key"
  ON "workflows" ("organizationId", "userId", "templateInstantiationKey");
