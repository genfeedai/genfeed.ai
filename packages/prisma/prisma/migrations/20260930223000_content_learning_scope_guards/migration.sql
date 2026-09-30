-- AlterTable
ALTER TABLE "content_learning_decisions" ADD COLUMN     "cellDescriptor" JSONB,
ADD COLUMN     "descriptorHash" TEXT,
ADD COLUMN     "executionProbabilities" JSONB,
ADD COLUMN     "scopeRevision" INTEGER;

-- AlterTable
ALTER TABLE "content_learning_baselines" ADD COLUMN     "cellDescriptor" JSONB,
ADD COLUMN     "descriptorHash" TEXT;

-- AlterTable
ALTER TABLE "content_learning_policy_versions" ADD COLUMN     "cellDescriptor" JSONB,
ADD COLUMN     "descriptorHash" TEXT;

-- AlterTable
ALTER TABLE "content_learning_dependencys" ADD COLUMN     "derivedOrganizationId" TEXT,
ADD COLUMN     "sourceOrganizationId" TEXT;

-- CreateTable
CREATE TABLE "content_learning_scope_states" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "activePolicyId" TEXT,
    "pinnedPolicyId" TEXT,
    "lastValidRewardAt" TIMESTAMP(3),
    "cellDescriptor" JSONB NOT NULL,
    "descriptorHash" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_learning_scope_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_learning_scope_states_organizationId_brandId_creden_idx" ON "content_learning_scope_states"("organizationId", "brandId", "credentialId", "isDeleted");

-- CreateIndex
CREATE INDEX "content_learning_scope_states_organizationId_scopeKey_epoch_idx" ON "content_learning_scope_states"("organizationId", "scopeKey", "epoch", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "content_learning_scope_states_organizationId_credentialId_s_key" ON "content_learning_scope_states"("organizationId", "credentialId", "scopeKey", "epoch");

-- CreateIndex
CREATE UNIQUE INDEX "posts_learningDecisionId_key" ON "posts"("learningDecisionId");

-- CreateIndex
CREATE INDEX "content_learning_dependencys_sourceKind_sourceId_sourceOrga_idx" ON "content_learning_dependencys"("sourceKind", "sourceId", "sourceOrganizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "content_learning_dependencys_derivedKind_derivedId_derivedO_idx" ON "content_learning_dependencys"("derivedKind", "derivedId", "derivedOrganizationId", "isDeleted");

-- AddForeignKey
ALTER TABLE "content_learning_scope_states" ADD CONSTRAINT "content_learning_scope_states_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_scope_states" ADD CONSTRAINT "content_learning_scope_states_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_scope_states" ADD CONSTRAINT "content_learning_scope_states_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_scope_states" ADD CONSTRAINT "content_learning_scope_states_activePolicyId_fkey" FOREIGN KEY ("activePolicyId") REFERENCES "content_learning_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_learning_scope_states" ADD CONSTRAINT "content_learning_scope_states_pinnedPolicyId_fkey" FOREIGN KEY ("pinnedPolicyId") REFERENCES "content_learning_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Legacy tenant identities require rebuild; never infer their organization by ID.
UPDATE "content_learning_dependencys" SET "valid"=false, "invalidatedAt"=CURRENT_TIMESTAMP WHERE "valid" AND NOT ((("sourceKind" IN ('dataset','run','shared-policy','release','config') AND "sourceOrganizationId" IS NULL) OR ("sourceKind" IN ('organization','brand','credential','post','account','checkpoint','baseline','decision','reward','policy','consent','experiment','enrollment','opportunity','experiment-event','provider_attempt','llm_vendor_cost','media_vendor_cost','publish_approval','post_publish_finalization','content_version_pin') AND "sourceOrganizationId" IS NOT NULL AND length(btrim("sourceOrganizationId")) > 0)) AND (("derivedKind" IN ('dataset','run','shared-policy','release','config') AND "derivedOrganizationId" IS NULL) OR ("derivedKind" IN ('organization','brand','credential','post','account','checkpoint','baseline','decision','reward','policy','consent','experiment','enrollment','opportunity','experiment-event','provider_attempt','llm_vendor_cost','media_vendor_cost','publish_approval','post_publish_finalization','content_version_pin') AND "derivedOrganizationId" IS NOT NULL AND length(btrim("derivedOrganizationId")) > 0)));
ALTER TABLE "content_learning_dependencys" ADD CONSTRAINT "learning_dependency_scoped_ends_check" CHECK (NOT "valid" OR ((("sourceKind" IN ('dataset','run','shared-policy','release','config') AND "sourceOrganizationId" IS NULL) OR ("sourceKind" IN ('organization','brand','credential','post','account','checkpoint','baseline','decision','reward','policy','consent','experiment','enrollment','opportunity','experiment-event','provider_attempt','llm_vendor_cost','media_vendor_cost','publish_approval','post_publish_finalization','content_version_pin') AND "sourceOrganizationId" IS NOT NULL AND length(btrim("sourceOrganizationId")) > 0)) AND (("derivedKind" IN ('dataset','run','shared-policy','release','config') AND "derivedOrganizationId" IS NULL) OR ("derivedKind" IN ('organization','brand','credential','post','account','checkpoint','baseline','decision','reward','policy','consent','experiment','enrollment','opportunity','experiment-event','provider_attempt','llm_vendor_cost','media_vendor_cost','publish_approval','post_publish_finalization','content_version_pin') AND "derivedOrganizationId" IS NOT NULL AND length(btrim("derivedOrganizationId")) > 0))));
ALTER TABLE "content_learning_scope_states" ADD CONSTRAINT "learning_scope_state_descriptor_check" CHECK ("epoch" >= 0 AND "revision" >= 0 AND jsonb_typeof("cellDescriptor") = 'object' AND "descriptorHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "content_learning_decisions_descriptor_check" CHECK (("cellDescriptor" IS NULL AND "descriptorHash" IS NULL) OR ("cellDescriptor" IS NOT NULL AND "descriptorHash" IS NOT NULL AND jsonb_typeof("cellDescriptor") = 'object' AND "descriptorHash" ~ '^[0-9a-f]{64}$'));
ALTER TABLE "content_learning_baselines" ADD CONSTRAINT "content_learning_baselines_descriptor_check" CHECK (("cellDescriptor" IS NULL AND "descriptorHash" IS NULL) OR ("cellDescriptor" IS NOT NULL AND "descriptorHash" IS NOT NULL AND jsonb_typeof("cellDescriptor") = 'object' AND "descriptorHash" ~ '^[0-9a-f]{64}$'));
ALTER TABLE "content_learning_policy_versions" ADD CONSTRAINT "content_learning_policy_versions_descriptor_check" CHECK (("cellDescriptor" IS NULL AND "descriptorHash" IS NULL) OR ("cellDescriptor" IS NOT NULL AND "descriptorHash" IS NOT NULL AND jsonb_typeof("cellDescriptor") = 'object' AND "descriptorHash" ~ '^[0-9a-f]{64}$'));
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "learning_decision_execution_distribution_check" CHECK (
 "executionProbabilities" IS NULL OR CASE
 WHEN jsonb_typeof("executionProbabilities") = 'object'
 AND "executionProbabilities" - ARRAY['baseline-v1','question-example-v1','proof-steps-v1'] = '{}'::jsonb
 AND jsonb_typeof("executionProbabilities"->'baseline-v1') = 'number'
 AND jsonb_typeof("executionProbabilities"->'question-example-v1') = 'number'
 AND jsonb_typeof("executionProbabilities"->'proof-steps-v1') = 'number'
 THEN COALESCE("selectedArmId" IN ('baseline-v1','question-example-v1','proof-steps-v1')
 AND "executionProbability" = ("executionProbabilities"->>"selectedArmId")::double precision
 AND ("executionProbabilities"->>'baseline-v1')::numeric BETWEEN 0 AND 1
 AND ("executionProbabilities"->>'question-example-v1')::numeric BETWEEN 0 AND 1
 AND ("executionProbabilities"->>'proof-steps-v1')::numeric BETWEEN 0 AND 1
 AND abs(("executionProbabilities"->>'baseline-v1')::numeric + ("executionProbabilities"->>'question-example-v1')::numeric + ("executionProbabilities"->>'proof-steps-v1')::numeric - 1) < 0.000000001, false)
 ELSE false END
);
ALTER TABLE "content_learning_decisions" ADD CONSTRAINT "learning_decision_scope_revision_check" CHECK ("scopeRevision" IS NULL OR "scopeRevision" >= 0);
