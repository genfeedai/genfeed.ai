-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "learningDecisionId" TEXT;

-- CreateTable
CREATE TABLE "content_learning_accounts" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'shadow',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "evidenceRevision" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3),
    "activeConfigVersion" TEXT NOT NULL DEFAULT 'rl-reward-v1-experimental',
    "sharingConsentVersion" INTEGER,
    "sharedReleasePreference" TEXT NOT NULL DEFAULT 'automatic',
    "pinnedReleaseId" TEXT,
    "activePolicyId" TEXT,
    "approvedArmIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pilotStartedAt" TIMESTAMP(3),
    "prePilotReleaseId" TEXT,
    "failureReason" TEXT,
    "driftState" TEXT,

    CONSTRAINT "content_learning_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_consents" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'shared_strategy_training_v1',
    "actorId" TEXT NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "content_learning_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_decisions" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "destinationKey" TEXT NOT NULL,
    "candidateIndex" INTEGER NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "accountRevision" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "contextVector" DOUBLE PRECISION[],
    "contextSnapshot" JSONB NOT NULL,
    "eligibleArmIds" TEXT[],
    "probabilities" JSONB NOT NULL,
    "selectedArmId" TEXT NOT NULL,
    "selectedProbability" DOUBLE PRECISION NOT NULL,
    "assignment" TEXT NOT NULL,
    "assignmentProbability" DOUBLE PRECISION NOT NULL,
    "executionProbability" DOUBLE PRECISION NOT NULL,
    "configVersion" TEXT NOT NULL,
    "baselineId" TEXT,
    "accountPolicyId" TEXT,
    "sharedReleaseId" TEXT,
    "sharedReleaseRevision" INTEGER,
    "modelVersion" TEXT,
    "briefVersion" TEXT,
    "promptVersion" TEXT,
    "harnessVersion" TEXT,
    "parentRequestId" TEXT,
    "runId" TEXT,
    "workflowExecutionId" TEXT,
    "generationId" TEXT,
    "originalPromptHash" TEXT,
    "finalArtifactHash" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "censorshipReason" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "content_learning_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_checkpoints" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL DEFAULT '48h-v1',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "sourceAttemptId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "requestStartedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "providerAsOf" TIMESTAMP(3),
    "sourceAnalyticsId" TEXT,
    "measurement" JSONB NOT NULL,
    "format" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "organicProvenance" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "supersedesId" TEXT,
    "validity" TEXT NOT NULL,
    "attestation" JSONB,

    CONSTRAINT "content_learning_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_baselines" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "cutoff" TIMESTAMP(3) NOT NULL,
    "configVersion" TEXT NOT NULL,
    "contributorCheckpointIds" TEXT[],
    "contributorRevisions" INTEGER[],
    "count" INTEGER NOT NULL,
    "medianExposure" DOUBLE PRECISION NOT NULL,
    "samples" JSONB NOT NULL,
    "validity" TEXT NOT NULL,

    CONSTRAINT "content_learning_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_rewards" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "rawComponents" JSONB NOT NULL,
    "boundedComponents" JSONB NOT NULL,
    "composite" DOUBLE PRECISION,
    "confidence" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "reasons" TEXT[],
    "sourceFingerprint" TEXT NOT NULL,
    "supersedesId" TEXT,

    CONSTRAINT "content_learning_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_policy_versions" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "parentId" TEXT,
    "algorithm" TEXT NOT NULL DEFAULT 'ridge-epsilon-v1',
    "configVersion" TEXT NOT NULL,
    "featureSchema" TEXT NOT NULL,
    "armState" JSONB NOT NULL,
    "coefficients" JSONB NOT NULL,
    "evidenceManifestHash" TEXT NOT NULL,
    "evidenceIds" TEXT[],
    "state" TEXT NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "content_learning_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_shared_policys" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cell" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "runId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "featureSchema" TEXT NOT NULL,
    "coefficients" JSONB NOT NULL,
    "directives" JSONB NOT NULL,
    "validity" TEXT NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "content_learning_shared_policys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_brand_preferences" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "preference" TEXT NOT NULL DEFAULT 'automatic',
    "pinnedReleaseId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "content_learning_brand_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_datasets" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "origin" TEXT NOT NULL,
    "ownerActorId" TEXT NOT NULL,
    "rightsStatement" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "cell" TEXT NOT NULL,
    "cutoff" TIMESTAMP(3) NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "invalidationRevision" INTEGER NOT NULL DEFAULT 0,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "content_learning_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_dataset_entrys" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "sourceReference" JSONB NOT NULL,
    "consentVersion" INTEGER,
    "accountGroup" TEXT NOT NULL,
    "decisionAt" TIMESTAMP(3) NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "features" DOUBLE PRECISION[],
    "armId" TEXT NOT NULL,
    "probabilities" JSONB NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "split" TEXT NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "content_learning_dataset_entrys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_runs" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "datasetId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "parentArtifactId" TEXT,
    "baselineArtifactId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "workflowExecutionId" TEXT,
    "resultArtifactId" TEXT,
    "report" JSONB,
    "seed" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "synthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "content_learning_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_releases" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "manifest" JSONB NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'candidate',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "priorReleaseId" TEXT,
    "recipientSalt" TEXT NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "invalidationRevision" INTEGER NOT NULL DEFAULT 0,
    "stageStartedAt" TIMESTAMP(3),
    "activeCells" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "content_learning_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_operations" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,
    "brandId" TEXT,
    "credentialId" TEXT,
    "scope" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "beforeRevision" INTEGER,
    "afterRevision" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "resultReferences" JSONB NOT NULL,

    CONSTRAINT "content_learning_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_learning_dependencys" (
    "id" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "derivedKind" TEXT NOT NULL,
    "derivedId" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL DEFAULT true,
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "content_learning_dependencys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_learning_accounts_organizationId_brandId_credential_idx" ON "content_learning_accounts"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_accounts_organizationId_credentialId_key" ON "content_learning_accounts"("organizationId", "credentialId");

-- CreateIndex
CREATE INDEX "content_learning_consents_organizationId_brandId_credential_idx" ON "content_learning_consents"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_consents_accountId_version_key" ON "content_learning_consents"("accountId", "version");

-- CreateIndex
CREATE INDEX "content_learning_decisions_organizationId_brandId_credentia_idx" ON "content_learning_decisions"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE INDEX "content_learning_decisions_scopeKey_epoch_createdAt_idx" ON "content_learning_decisions"("scopeKey", "epoch", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_decisions_organizationId_requestKey_destin_key" ON "content_learning_decisions"("organizationId", "requestKey", "destinationKey", "candidateIndex");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_checkpoints_sourceFingerprint_key" ON "content_learning_checkpoints"("sourceFingerprint");

-- CreateIndex
CREATE INDEX "content_learning_checkpoints_organizationId_brandId_credent_idx" ON "content_learning_checkpoints"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE INDEX "content_learning_checkpoints_organizationId_credentialId_fo_idx" ON "content_learning_checkpoints"("organizationId", "credentialId", "format", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_checkpoints_organizationId_postId_credenti_key" ON "content_learning_checkpoints"("organizationId", "postId", "credentialId", "windowId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_baselines_fingerprint_key" ON "content_learning_baselines"("fingerprint");

-- CreateIndex
CREATE INDEX "content_learning_baselines_organizationId_brandId_credentia_idx" ON "content_learning_baselines"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE INDEX "content_learning_baselines_scopeKey_cutoff_idx" ON "content_learning_baselines"("scopeKey", "cutoff");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_rewards_sourceFingerprint_key" ON "content_learning_rewards"("sourceFingerprint");

-- CreateIndex
CREATE INDEX "content_learning_rewards_organizationId_brandId_credentialI_idx" ON "content_learning_rewards"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE INDEX "content_learning_rewards_organizationId_credentialId_status_idx" ON "content_learning_rewards"("organizationId", "credentialId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_rewards_decisionId_version_key" ON "content_learning_rewards"("decisionId", "version");

-- CreateIndex
CREATE INDEX "content_learning_policy_versions_organizationId_brandId_cre_idx" ON "content_learning_policy_versions"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_policy_versions_scopeKey_epoch_version_key" ON "content_learning_policy_versions"("scopeKey", "epoch", "version");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_shared_policys_cell_version_key" ON "content_learning_shared_policys"("cell", "version");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_brand_preferences_organizationId_brandId_key" ON "content_learning_brand_preferences"("organizationId", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_datasets_manifestHash_key" ON "content_learning_datasets"("manifestHash");

-- CreateIndex
CREATE INDEX "content_learning_dataset_entrys_datasetId_split_idx" ON "content_learning_dataset_entrys"("datasetId", "split");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_dataset_entrys_datasetId_sourceFingerprint_key" ON "content_learning_dataset_entrys"("datasetId", "sourceFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_runs_idempotencyKey_key" ON "content_learning_runs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "content_learning_operations_organizationId_status_idx" ON "content_learning_operations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_operations_actorId_scope_requestId_key" ON "content_learning_operations"("actorId", "scope", "requestId");

-- CreateIndex
CREATE INDEX "content_learning_dependencys_sourceKind_sourceId_valid_idx" ON "content_learning_dependencys"("sourceKind", "sourceId", "valid");

-- CreateIndex
CREATE INDEX "content_learning_dependencys_derivedKind_derivedId_valid_idx" ON "content_learning_dependencys"("derivedKind", "derivedId", "valid");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_dependencys_sourceKind_sourceId_sourceVers_key" ON "content_learning_dependencys"("sourceKind", "sourceId", "sourceVersion", "derivedKind", "derivedId");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_learningDecisionId_fkey" FOREIGN KEY ("learningDecisionId") REFERENCES "content_learning_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_accounts" ADD CONSTRAINT "content_learning_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_accounts" ADD CONSTRAINT "content_learning_accounts_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_accounts" ADD CONSTRAINT "content_learning_accounts_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_consents" ADD CONSTRAINT "content_learning_consents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_consents" ADD CONSTRAINT "content_learning_consents_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_consents" ADD CONSTRAINT "content_learning_consents_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_consents" ADD CONSTRAINT "content_learning_consents_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "content_learning_decisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "content_learning_decisions_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "content_learning_decisions_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_checkpoints" ADD CONSTRAINT "content_learning_checkpoints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_checkpoints" ADD CONSTRAINT "content_learning_checkpoints_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_checkpoints" ADD CONSTRAINT "content_learning_checkpoints_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_checkpoints" ADD CONSTRAINT "content_learning_checkpoints_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_baselines" ADD CONSTRAINT "content_learning_baselines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_baselines" ADD CONSTRAINT "content_learning_baselines_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_baselines" ADD CONSTRAINT "content_learning_baselines_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_rewards" ADD CONSTRAINT "content_learning_rewards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_rewards" ADD CONSTRAINT "content_learning_rewards_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_rewards" ADD CONSTRAINT "content_learning_rewards_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_policy_versions" ADD CONSTRAINT "content_learning_policy_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_policy_versions" ADD CONSTRAINT "content_learning_policy_versions_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_policy_versions" ADD CONSTRAINT "content_learning_policy_versions_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_brand_preferences" ADD CONSTRAINT "content_learning_brand_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_brand_preferences" ADD CONSTRAINT "content_learning_brand_preferences_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_datasets" ADD CONSTRAINT "content_learning_datasets_ownerActorId_fkey" FOREIGN KEY ("ownerActorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_dataset_entrys" ADD CONSTRAINT "content_learning_dataset_entrys_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "content_learning_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_operations" ADD CONSTRAINT "content_learning_operations_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "content_learning_accounts" ADD CONSTRAINT "learning_account_mode_check" CHECK ("mode" IN ('shadow','live','paused','disabled','blocked'));
ALTER TABLE "content_learning_accounts" ADD CONSTRAINT "learning_account_revision_check" CHECK ("revision" >= 0 AND "epoch" >= 0 AND "evidenceRevision" >= 0);
ALTER TABLE "content_learning_accounts" ADD CONSTRAINT "learning_account_preference_check" CHECK ("sharedReleasePreference" IN ('automatic','disabled','pinned'));
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "learning_decision_vector_check" CHECK (cardinality("contextVector") = 9);
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "learning_decision_probability_check" CHECK ("selectedProbability" > 0 AND "selectedProbability" <= 1 AND "assignmentProbability" > 0 AND "assignmentProbability" <= 1 AND "executionProbability" > 0 AND "executionProbability" <= 1 AND "candidateIndex" >= 0);
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "learning_decision_distribution_check" CHECK ("probabilities" ?& ARRAY['baseline-v1','question-example-v1','proof-steps-v1'] AND ("probabilities"->>'baseline-v1')::numeric BETWEEN 0 AND 1 AND ("probabilities"->>'question-example-v1')::numeric BETWEEN 0 AND 1 AND ("probabilities"->>'proof-steps-v1')::numeric BETWEEN 0 AND 1 AND abs(("probabilities"->>'baseline-v1')::numeric + ("probabilities"->>'question-example-v1')::numeric + ("probabilities"->>'proof-steps-v1')::numeric - 1) < 0.000000001);
ALTER TABLE "content_learning_rewards" ADD CONSTRAINT "learning_reward_bounds_check" CHECK ("composite" IS NULL OR "composite" BETWEEN -1 AND 1);
ALTER TABLE "content_learning_policy_versions" ADD CONSTRAINT "learning_policy_state_check" CHECK ("state" IN ('candidate','active','retired','invalid'));
ALTER TABLE "content_learning_dataset_entries" ADD CONSTRAINT "learning_dataset_numeric_check" CHECK (cardinality("features") = 9 AND "reward" BETWEEN -1 AND 1 AND "split" IN ('training','temporal_holdout','account_holdout','excluded'));
ALTER TABLE "content_learning_releases" ADD CONSTRAINT "learning_release_stage_check" CHECK ("stage" IN ('candidate','canary','limited','stable','paused','retired','invalid') AND "revision" >= 0);
ALTER TABLE "content_learning_runs" ADD CONSTRAINT "learning_run_status_check" CHECK ("status" IN ('pending','running','completed','failed','cancelled','invalidated','insufficient_data'));
ALTER TABLE "content_learning_operations" ADD CONSTRAINT "learning_operation_status_check" CHECK ("status" IN ('pending','running','completed','failed','cancelled','invalidated'));
ALTER TABLE "content_learning_consents" ADD CONSTRAINT "learning_consent_account_fk" FOREIGN KEY ("accountId") REFERENCES "content_learning_accounts"("id") ON DELETE RESTRICT;
ALTER TABLE "content_learning_rewards" ADD CONSTRAINT "learning_reward_decision_fk" FOREIGN KEY ("decisionId") REFERENCES "content_learning_decisions"("id") ON DELETE RESTRICT;
ALTER TABLE "content_learning_rewards" ADD CONSTRAINT "learning_reward_baseline_fk" FOREIGN KEY ("baselineId") REFERENCES "content_learning_baselines"("id") ON DELETE RESTRICT;
ALTER TABLE "content_learning_rewards" ADD CONSTRAINT "learning_reward_checkpoint_fk" FOREIGN KEY ("checkpointId") REFERENCES "content_learning_checkpoints"("id") ON DELETE RESTRICT;
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "learning_decision_baseline_fk" FOREIGN KEY ("baselineId") REFERENCES "content_learning_baselines"("id") ON DELETE RESTRICT;
ALTER TABLE "content_learning_runs" ADD CONSTRAINT "learning_run_dataset_fk" FOREIGN KEY ("datasetId") REFERENCES "content_learning_datasets"("id") ON DELETE RESTRICT;
ALTER TABLE "content_learning_shared_policys" ADD CONSTRAINT "learning_shared_dataset_fk" FOREIGN KEY ("datasetId") REFERENCES "content_learning_datasets"("id") ON DELETE RESTRICT;
