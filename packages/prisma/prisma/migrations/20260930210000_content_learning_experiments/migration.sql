-- AlterTable
ALTER TABLE "content_learning_decisions" ADD COLUMN     "opportunityId" TEXT;

-- CreateTable
CREATE TABLE "content_learning_experiments" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "credentialId" TEXT,
    "kind" TEXT NOT NULL,
    "cellKey" TEXT NOT NULL,
    "candidatePolicyId" TEXT,
    "controlPolicyId" TEXT,
    "candidateReleaseId" TEXT,
    "controlReleaseId" TEXT,
    "builtInControlVersion" TEXT,
    "stage" TEXT,
    "releaseRevision" INTEGER,
    "spec" JSONB NOT NULL,
    "specHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preregistered',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "encryptedSeed" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "freezeAt" TIMESTAMP(3) NOT NULL,
    "sealedAt" TIMESTAMP(3),

    CONSTRAINT "content_learning_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_enrollments" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "accountEpoch" INTEGER NOT NULL,
    "ownerOperationId" TEXT NOT NULL,
    "consentNoticeVersion" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "cohortHash" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL,
    "cohortFraction" DOUBLE PRECISION NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "baselineSnapshot" JSONB NOT NULL,
    "cadenceSnapshot" JSONB NOT NULL,

    CONSTRAINT "content_learning_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_opportunities" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "destinationKey" TEXT NOT NULL,
    "candidateIndex" INTEGER NOT NULL,
    "decisionId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "group" TEXT NOT NULL,
    "groupProbability" DOUBLE PRECISION NOT NULL,
    "assignmentDraw" DOUBLE PRECISION NOT NULL,
    "specHash" TEXT NOT NULL,
    "stage" TEXT,
    "releaseRevision" INTEGER,
    "policyManifest" JSONB NOT NULL,
    "parentRequestId" TEXT,
    "runId" TEXT,
    "workflowExecutionId" TEXT,
    "nodeId" TEXT,
    "ingredientId" TEXT,
    "postId" TEXT,
    "slotReservationId" TEXT,
    "cadenceId" TEXT,
    "artifactHash" TEXT,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'assigned',

    CONSTRAINT "content_learning_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_experiment_events" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "credentialId" TEXT,
    "experimentId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "enrollmentId" TEXT,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRevision" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "payloadSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "supersedesId" TEXT,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "content_learning_experiment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_experiments_specHash_key" ON "content_learning_experiments"("specHash");

-- CreateIndex
CREATE INDEX "content_learning_experiments_organizationId_brandId_credent_idx" ON "content_learning_experiments"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE INDEX "content_learning_enrollments_organizationId_brandId_credent_idx" ON "content_learning_enrollments"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_enrollments_experimentId_organizationId_cr_key" ON "content_learning_enrollments"("experimentId", "organizationId", "credentialId");

-- CreateIndex
CREATE INDEX "content_learning_opportunities_organizationId_brandId_crede_idx" ON "content_learning_opportunities"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_opportunities_experimentId_organizationId__key" ON "content_learning_opportunities"("experimentId", "organizationId", "requestKey", "destinationKey", "candidateIndex");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_experiment_events_fingerprint_key" ON "content_learning_experiment_events"("fingerprint");

-- CreateIndex
CREATE INDEX "content_learning_experiment_events_opportunityId_kind_occur_idx" ON "content_learning_experiment_events"("opportunityId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "content_learning_experiment_events_organizationId_brandId_c_idx" ON "content_learning_experiment_events"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_experiment_events_experimentId_organizatio_key" ON "content_learning_experiment_events"("experimentId", "organizationId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_decisions_opportunityId_key" ON "content_learning_decisions"("opportunityId");

-- AddForeignKey
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "content_learning_decisions_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "content_learning_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiments" ADD CONSTRAINT "content_learning_experiments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiments" ADD CONSTRAINT "content_learning_experiments_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiments" ADD CONSTRAINT "content_learning_experiments_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiments" ADD CONSTRAINT "content_learning_experiments_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_enrollments" ADD CONSTRAINT "content_learning_enrollments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_enrollments" ADD CONSTRAINT "content_learning_enrollments_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_enrollments" ADD CONSTRAINT "content_learning_enrollments_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_enrollments" ADD CONSTRAINT "content_learning_enrollments_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "content_learning_experiments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_enrollments" ADD CONSTRAINT "content_learning_enrollments_ownerOperationId_fkey" FOREIGN KEY ("ownerOperationId") REFERENCES "content_learning_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_opportunities" ADD CONSTRAINT "content_learning_opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_opportunities" ADD CONSTRAINT "content_learning_opportunities_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_opportunities" ADD CONSTRAINT "content_learning_opportunities_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_opportunities" ADD CONSTRAINT "content_learning_opportunities_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "content_learning_experiments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_opportunities" ADD CONSTRAINT "content_learning_opportunities_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "content_learning_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiment_events" ADD CONSTRAINT "content_learning_experiment_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiment_events" ADD CONSTRAINT "content_learning_experiment_events_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiment_events" ADD CONSTRAINT "content_learning_experiment_events_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiment_events" ADD CONSTRAINT "content_learning_experiment_events_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "content_learning_experiments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiment_events" ADD CONSTRAINT "content_learning_experiment_events_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "content_learning_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_experiment_events" ADD CONSTRAINT "content_learning_experiment_events_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "content_learning_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "content_learning_experiments" ADD CONSTRAINT "learning_experiment_scope_check" CHECK (("kind" = 'private_pilot' AND "brandId" IS NOT NULL AND "credentialId" IS NOT NULL) OR ("kind" = 'shared_stage' AND "brandId" IS NULL AND "credentialId" IS NULL));
ALTER TABLE "content_learning_experiments" ADD CONSTRAINT "learning_experiment_status_check" CHECK ("status" IN ('preregistered','sealed','running','cancelled','completed','invalidated') AND "revision" >= 0 AND "endAt" > "startAt" AND "freezeAt" >= "endAt");
ALTER TABLE "content_learning_enrollments" ADD CONSTRAINT "learning_enrollment_fraction_check" CHECK ("cohortFraction" IN (0.05,0.25,1) AND "accountEpoch" >= 0 AND "endAt" > "startAt");
ALTER TABLE "content_learning_opportunities" ADD CONSTRAINT "learning_opportunity_assignment_check" CHECK ("group" IN ('control','treatment') AND "groupProbability" > 0 AND "groupProbability" <= 1 AND "assignmentDraw" >= 0 AND "assignmentDraw" < 1 AND "candidateIndex" >= 0);
ALTER TABLE "content_learning_experiment_events" ADD CONSTRAINT "learning_experiment_event_kind_check" CHECK ("kind" IN ('artifact','readiness','approval','publish','edit','safety','cost_attempt','cost_settlement','cadence','withdrawal','report'));
ALTER TABLE "content_learning_experiment_events" ADD CONSTRAINT "learning_experiment_event_scope_check" CHECK (("opportunityId" IS NULL AND "enrollmentId" IS NULL AND "kind" = 'report') OR ("brandId" IS NOT NULL AND "credentialId" IS NOT NULL));
