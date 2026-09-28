-- Studio Batch projects (#5463): Batch and Fastlane merge into one persisted
-- surface. A project is an idea batch or a workflow batch; every step, input
-- and per-item state lives here so a reload restores the run.

CREATE TYPE "BatchProjectKind" AS ENUM (
  'IDEAS',
  'WORKFLOW'
);

CREATE TYPE "BatchProjectStatus" AS ENUM (
  'DRAFT',
  'GENERATING',
  'REVIEWING',
  'SCHEDULED',
  'COMPLETED',
  'PARTIAL_FAILURE',
  'CANCELLED'
);

CREATE TYPE "BatchProjectItemStatus" AS ENUM (
  'PENDING',
  'GENERATING',
  'READY',
  'FAILED',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "batch_projects" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "BatchProjectKind" NOT NULL,
  "name" TEXT NOT NULL,
  "status" "BatchProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "step" TEXT NOT NULL,
  "workflowId" TEXT,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "reviewBatchId" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "batch_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "batch_project_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "BatchProjectItemStatus" NOT NULL DEFAULT 'PENDING',
  "idea" JSONB,
  "inputIngredientId" TEXT,
  "inputCategory" TEXT,
  "workflowExecutionId" TEXT,
  "workflowItemIndex" INTEGER,
  "outputIngredientId" TEXT,
  "outputCategory" TEXT,
  "caption" TEXT,
  "error" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "postId" TEXT,
  "reviewBatchId" TEXT,
  "reviewItemId" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "batch_project_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "batch_projects_organizationId_brandId_isDeleted_updatedAt_idx" ON "batch_projects"("organizationId", "brandId", "isDeleted", "updatedAt" DESC);
CREATE INDEX "batch_projects_status_isDeleted_updatedAt_idx" ON "batch_projects"("status", "isDeleted", "updatedAt");
CREATE INDEX "batch_project_items_org_project_position_idx" ON "batch_project_items"("organizationId", "projectId", "isDeleted", "position");
CREATE INDEX "batch_project_items_organizationId_reviewItemId_isDeleted_idx" ON "batch_project_items"("organizationId", "reviewItemId", "isDeleted");

ALTER TABLE "batch_projects" ADD CONSTRAINT "batch_projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batch_project_items" ADD CONSTRAINT "batch_project_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batch_project_items" ADD CONSTRAINT "batch_project_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "batch_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
