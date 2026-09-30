ALTER TABLE "llm_vendor_costs" ADD COLUMN "learningAttemptId" TEXT;
ALTER TABLE "media_vendor_costs" ADD COLUMN "learningAttemptId" TEXT;

CREATE UNIQUE INDEX "llm_vendor_costs_learningAttemptId_key" ON "llm_vendor_costs"("learningAttemptId");
CREATE UNIQUE INDEX "media_vendor_costs_learningAttemptId_key" ON "media_vendor_costs"("learningAttemptId");
