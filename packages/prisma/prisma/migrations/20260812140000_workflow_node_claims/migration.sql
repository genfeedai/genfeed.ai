-- Durable per-node idempotency claims for workflow side-effect safety (#2359).
-- A unique (executionId, nodeId) row is inserted before dispatching a node.
-- Duplicate insert (P2002) means the node already ran — re-emit stored output.

CREATE TABLE IF NOT EXISTS "workflow_node_claims" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_node_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_node_claims_executionId_nodeId_key"
  ON "workflow_node_claims" ("executionId", "nodeId");

CREATE INDEX IF NOT EXISTS "workflow_node_claims_organizationId_executionId_idx"
  ON "workflow_node_claims" ("organizationId", "executionId");
