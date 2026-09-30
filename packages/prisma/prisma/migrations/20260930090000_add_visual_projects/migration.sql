-- CreateTable
CREATE TABLE "visual_projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visual_revisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "prompt" TEXT,
    "sourceCode" TEXT,
    "sourceHash" TEXT,
    "modelKey" TEXT,
    "rendererVersion" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "props" JSONB NOT NULL DEFAULT '{}',
    "sourceAssetIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "workflowExecutionId" TEXT,
    "reservationId" TEXT,
    "maximumCredits" DOUBLE PRECISION NOT NULL,
    "consumedCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receipts" JSONB NOT NULL DEFAULT '[]',
    "preview" JSONB NOT NULL DEFAULT '[]',
    "outputRequests" JSONB NOT NULL DEFAULT '[{"format":"mp4"}]',
    "outputs" JSONB NOT NULL DEFAULT '[]',
    "diagnostics" JSONB NOT NULL DEFAULT '[]',
    "cancelRequestedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visual_projects_organizationId_brandId_isDeleted_createdAt_idx" ON "visual_projects"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "visual_projects_organizationId_brandId_requestId_key" ON "visual_projects"("organizationId", "brandId", "requestId");

-- CreateIndex
CREATE INDEX "visual_revisions_organizationId_brandId_projectId_status_is_idx" ON "visual_revisions"("organizationId", "brandId", "projectId", "status", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "visual_revisions_projectId_number_key" ON "visual_revisions"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "visual_revisions_projectId_requestId_key" ON "visual_revisions"("projectId", "requestId");

-- AddForeignKey
ALTER TABLE "visual_projects" ADD CONSTRAINT "visual_projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_projects" ADD CONSTRAINT "visual_projects_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_projects" ADD CONSTRAINT "visual_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_revisions" ADD CONSTRAINT "visual_revisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_revisions" ADD CONSTRAINT "visual_revisions_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_revisions" ADD CONSTRAINT "visual_revisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_revisions" ADD CONSTRAINT "visual_revisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "visual_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

