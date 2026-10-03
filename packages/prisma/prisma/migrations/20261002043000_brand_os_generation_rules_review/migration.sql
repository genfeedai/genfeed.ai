-- Review acknowledgement remains nullable for historical and rules-absent revisions.
ALTER TABLE "brand_os_revisions"
  ADD COLUMN "generationRulesReviewHash" TEXT,
  ADD CONSTRAINT "brand_os_revisions_generation_rules_review_hash_check"
    CHECK ("generationRulesReviewHash" IS NULL OR
      (char_length("generationRulesReviewHash") = 71 AND "generationRulesReviewHash" ~ '^sha256:[0-9a-f]{64}$'));
