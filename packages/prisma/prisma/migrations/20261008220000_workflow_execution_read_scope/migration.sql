-- Append-only authorization classification. Existing execution history is deliberately not backfilled.
CREATE UNIQUE INDEX "agent_strategies_id_organizationId_key" ON "agent_strategies" ("id", "organizationId");
CREATE UNIQUE INDEX "agent_threads_id_organizationId_key" ON "agent_threads" ("id", "organizationId");
CREATE UNIQUE INDEX "workflow_versions_id_organizationId_key" ON "workflow_versions" ("id", "organizationId");
CREATE TABLE "workflow_execution_read_scopes" (
  "executionId" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "protocolVersion" INTEGER NOT NULL DEFAULT 1,
  "family" TEXT NOT NULL,
  "coverage" TEXT NOT NULL DEFAULT 'UNPROVEN',
  "scopeClass" TEXT NOT NULL DEFAULT 'ORG_ONLY',
  "rootContentHash" TEXT NOT NULL,
  "producer" TEXT NOT NULL,
  "proactiveStrategyId" TEXT,
  "proactiveThreadId" TEXT,
  "batchChildVersionId" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_execution_read_scopes_execution_org_key" UNIQUE ("executionId", "organizationId"),
  CONSTRAINT "workflow_execution_read_scopes_shape_check" CHECK (
    "protocolVersion" = 1 AND "family" IN ('AUTHORED', 'PROACTIVE', 'BATCH', 'NATIVE')
    AND "coverage" IN ('UNPROVEN', 'TRACKED') AND "scopeClass" IN ('ORG_ONLY', 'BRAND_BOUND')
    AND length("rootContentHash") > 0 AND length("producer") > 0
    AND (("family" = 'PROACTIVE' AND "proactiveStrategyId" IS NOT NULL AND "proactiveThreadId" IS NOT NULL)
      OR ("family" <> 'PROACTIVE' AND "proactiveStrategyId" IS NULL AND "proactiveThreadId" IS NULL))
    AND (("family" = 'BATCH' AND "batchChildVersionId" IS NOT NULL)
      OR ("family" <> 'BATCH' AND "batchChildVersionId" IS NULL))
  ),
  CONSTRAINT "workflow_execution_read_scopes_execution_fkey" FOREIGN KEY ("executionId", "organizationId")
    REFERENCES "workflow_executions" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workflow_execution_read_scopes_strategy_fkey" FOREIGN KEY ("proactiveStrategyId", "organizationId")
    REFERENCES "agent_strategies" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workflow_execution_read_scopes_thread_fkey" FOREIGN KEY ("proactiveThreadId", "organizationId")
    REFERENCES "agent_threads" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workflow_execution_read_scopes_batch_version_fkey" FOREIGN KEY ("batchChildVersionId", "organizationId")
    REFERENCES "workflow_versions" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "workflow_execution_read_brand_dependencies" (
  "executionId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("executionId", "organizationId", "brandId"),
  CONSTRAINT "workflow_execution_read_dependencies_scope_fkey" FOREIGN KEY ("executionId", "organizationId")
    REFERENCES "workflow_execution_read_scopes" ("executionId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workflow_execution_read_dependencies_brand_fkey" FOREIGN KEY ("brandId", "organizationId")
    REFERENCES "brands" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "workflow_execution_read_lineage" (
  "parentExecutionId" TEXT NOT NULL,
  "childExecutionId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "parentNodeId" TEXT NOT NULL,
  "itemIndex" INTEGER NOT NULL DEFAULT -1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("parentExecutionId", "childExecutionId", "parentNodeId", "itemIndex", "organizationId"),
  CONSTRAINT "workflow_execution_read_lineage_shape_check" CHECK (
    "parentExecutionId" <> "childExecutionId" AND "itemIndex" >= -1 AND length("parentNodeId") > 0
  ),
  CONSTRAINT "workflow_execution_read_lineage_parent_execution_fkey" FOREIGN KEY ("parentExecutionId", "organizationId")
    REFERENCES "workflow_executions" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workflow_execution_read_lineage_child_execution_fkey" FOREIGN KEY ("childExecutionId", "organizationId")
    REFERENCES "workflow_executions" ("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workflow_execution_read_lineage_parent_scope_fkey" FOREIGN KEY ("parentExecutionId", "organizationId")
    REFERENCES "workflow_execution_read_scopes" ("executionId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workflow_execution_read_lineage_child_scope_fkey" FOREIGN KEY ("childExecutionId", "organizationId")
    REFERENCES "workflow_execution_read_scopes" ("executionId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "workflow_execution_read_lineage_child_idx" ON "workflow_execution_read_lineage" ("childExecutionId", "organizationId");
CREATE FUNCTION "guard_workflow_execution_read_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Execution read scope is immutable'; END IF;
  IF ROW(NEW."executionId", NEW."organizationId", NEW."protocolVersion", NEW."family", NEW."rootContentHash", NEW."producer",
      NEW."proactiveStrategyId", NEW."proactiveThreadId", NEW."batchChildVersionId", NEW."createdAt") IS DISTINCT FROM
    ROW(OLD."executionId", OLD."organizationId", OLD."protocolVersion", OLD."family", OLD."rootContentHash", OLD."producer",
      OLD."proactiveStrategyId", OLD."proactiveThreadId", OLD."batchChildVersionId", OLD."createdAt")
    OR (OLD."coverage" = 'UNPROVEN' AND NEW."coverage" <> 'UNPROVEN')
    OR (OLD."scopeClass" = 'BRAND_BOUND' AND NEW."scopeClass" <> 'BRAND_BOUND')
    OR (OLD."isDeleted" AND NOT NEW."isDeleted") THEN
    RAISE EXCEPTION 'Execution read scope cannot be rebound or widened';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "workflow_execution_read_scope_guard" BEFORE UPDATE OR DELETE ON "workflow_execution_read_scopes"
  FOR EACH ROW EXECUTE FUNCTION "guard_workflow_execution_read_scope"();
CREATE FUNCTION "guard_workflow_execution_read_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Execution read dependencies and lineage are append-only'; END $$;
CREATE TRIGGER "workflow_execution_read_dependency_guard" BEFORE UPDATE OR DELETE ON "workflow_execution_read_brand_dependencies"
  FOR EACH ROW EXECUTE FUNCTION "guard_workflow_execution_read_append_only"();
CREATE TRIGGER "workflow_execution_read_lineage_guard" BEFORE UPDATE OR DELETE ON "workflow_execution_read_lineage"
  FOR EACH ROW EXECUTE FUNCTION "guard_workflow_execution_read_append_only"();
