CREATE TABLE "branded_generation_receipts" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "brandId" TEXT NOT NULL,
 "actorId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "candidateIndex" INTEGER NOT NULL CHECK ("candidateIndex" >= 0),
 "requestHash" TEXT NOT NULL CHECK ("requestHash" ~ '^sha256:[0-9a-f]{64}$'),
 "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
 "state" TEXT NOT NULL CHECK ("state" IN ('created','resolved','dispatched','checking','ready','needs_review','blocked','failed','cancelled')),
 "mode" TEXT NOT NULL CHECK ("mode" IN ('approved_brand','provisional_brand','raw')),
 "surface" TEXT NOT NULL CHECK ("surface" IN ('onboarding','studio','ui','agent','api','mcp','workflow','schedule','batch','desktop_cloud','desktop_local')),
 "providerAttemptRef" TEXT UNIQUE, "projection" JSONB NOT NULL, "isDeleted" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE ("id","organizationId","brandId"), CONSTRAINT "branded_generation_receipts_request_key" UNIQUE ("organizationId","brandId","requestKey","candidateIndex"),
 FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("brandId","organizationId") REFERENCES "brands"("id","organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "branded_generation_receipts_projection_check" CHECK (
 jsonb_typeof("projection") = 'object' AND octet_length("projection"::text) <= 1572864 AND
 "projection" @> jsonb_build_object('id',"id",'organizationId',"organizationId",'brandId',"brandId",'actorId',"actorId",'requestKey',"requestKey",'candidateIndex',"candidateIndex",'requestHash',"requestHash",'revision',"revision",'state',"state",'mode',"mode",'surface',"surface",'isDeleted',"isDeleted",'createdAt',to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedAt',to_char("updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AND
 (("projection" #>> '{execution,providerAttemptRef}') IS NOT DISTINCT FROM "providerAttemptRef")
 )
);
CREATE INDEX "branded_generation_receipts_scope_idx" ON "branded_generation_receipts"("organizationId","brandId","isDeleted","createdAt" DESC,"id" DESC);
CREATE TABLE "branded_generation_receipt_events" (
 "id" TEXT PRIMARY KEY, "receiptId" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "brandId" TEXT NOT NULL,
 "actorId" TEXT NOT NULL, "operationKey" TEXT NOT NULL, "operationHash" TEXT NOT NULL CHECK ("operationHash" ~ '^sha256:[0-9a-f]{64}$'),
 "revision" INTEGER NOT NULL CHECK ("revision" >= 0), "type" TEXT NOT NULL, "projection" JSONB NOT NULL,
 "isDeleted" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("receiptId","revision"), UNIQUE ("receiptId","operationKey"),
 CONSTRAINT "branded_generation_receipt_events_receipt_scope_fkey" FOREIGN KEY ("receiptId","organizationId","brandId") REFERENCES "branded_generation_receipts"("id","organizationId","brandId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK (jsonb_typeof("projection") = 'object' AND octet_length("projection"::text) <= 1572864)
);
CREATE INDEX "branded_generation_receipt_events_scope_idx" ON "branded_generation_receipt_events"("organizationId","brandId","receiptId","revision");
ALTER TABLE "generation_prompt_snapshots"
 ADD COLUMN "brandedGenerationReceiptId" TEXT,
 ADD COLUMN "brandedGenerationReceiptRevision" INTEGER,
 ADD COLUMN "brandedGenerationReceiptStage" TEXT,
 ADD CONSTRAINT "generation_prompt_snapshots_receipt_fkey" FOREIGN KEY ("brandedGenerationReceiptId","organizationId","brandId") REFERENCES "branded_generation_receipts"("id","organizationId","brandId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT "generation_prompt_snapshots_branded_link_check" CHECK (
 ("format" = 'genfeed.branded-generation-prompt.v1' AND "contentHash" ~ '^sha256:[0-9a-f]{64}$' AND "brandedGenerationReceiptId" IS NOT NULL AND "brandedGenerationReceiptRevision" IS NOT NULL AND "brandedGenerationReceiptRevision" >= 0 AND "brandId" IS NOT NULL AND "brandedGenerationReceiptStage" IS NOT NULL AND "brandedGenerationReceiptStage" IN ('original','enhanced','compiled')) OR
 ("format" <> 'genfeed.branded-generation-prompt.v1' AND "brandedGenerationReceiptId" IS NULL AND "brandedGenerationReceiptRevision" IS NULL AND "brandedGenerationReceiptStage" IS NULL)
 );
CREATE INDEX "generation_prompt_snapshots_receipt_idx" ON "generation_prompt_snapshots"("brandedGenerationReceiptId","isDeleted");
CREATE UNIQUE INDEX "generation_prompt_snapshots_receipt_revision_stage_key" ON "generation_prompt_snapshots"("brandedGenerationReceiptId","brandedGenerationReceiptRevision","brandedGenerationReceiptStage");
ALTER TABLE "generation_prompt_snapshots" DROP CONSTRAINT "generation_prompt_snapshots_ciphertext_check";
ALTER TABLE "generation_prompt_snapshots" ADD CONSTRAINT "generation_prompt_snapshots_ciphertext_check" CHECK (
 ("format" <> 'genfeed.branded-generation-prompt.v1' AND (
        "ciphertext" ~ '^[0-9a-fA-F]{32}:[0-9a-fA-F]+:[0-9a-fA-F]{32}$'
        AND "retentionState" IN ('retained', 'purged')
 )) OR ("format" = 'genfeed.branded-generation-prompt.v1' AND (
 ("retentionState" = 'retained' AND "ciphertext" ~ '^[0-9a-fA-F]{32}:[0-9a-fA-F]+:[0-9a-fA-F]{32}$') OR
 ("retentionState" = 'purged' AND "ciphertext" = '' AND "isDeleted" = true)
 ))
);
CREATE FUNCTION branded_generation_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'receipt_immutable'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW."revision" <> 0 THEN RAISE EXCEPTION 'receipt_revision_invalid'; END IF;
 ELSE
  IF ROW(NEW."id",NEW."organizationId",NEW."brandId",NEW."actorId",NEW."requestKey",NEW."candidateIndex",NEW."requestHash",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."organizationId",OLD."brandId",OLD."actorId",OLD."requestKey",OLD."candidateIndex",OLD."requestHash",OLD."createdAt") OR
  NEW."revision" <> OLD."revision" + 1 OR OLD."isDeleted" THEN RAISE EXCEPTION 'receipt_immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER branded_generation_receipt_immutable BEFORE INSERT OR UPDATE OR DELETE ON "branded_generation_receipts" FOR EACH ROW EXECUTE FUNCTION branded_generation_receipt_immutable();
CREATE FUNCTION branded_generation_receipt_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt "branded_generation_receipts"; event "branded_generation_receipt_events"; event_count bigint; first_revision integer; last_revision integer;
BEGIN
 SELECT * INTO receipt FROM "branded_generation_receipts" WHERE "id" = NEW."id";
 SELECT * INTO event FROM "branded_generation_receipt_events" WHERE "receiptId" = NEW."id" AND "revision" = NEW."revision";
 IF NOT FOUND OR event."projection" IS DISTINCT FROM NEW."projection" OR event."organizationId" <> NEW."organizationId" OR event."brandId" <> NEW."brandId" OR event."isDeleted" IS DISTINCT FROM NEW."isDeleted" OR
 (NEW."revision" = 0 AND (event."type" <> 'create' OR event."operationKey" <> 'create')) THEN RAISE EXCEPTION 'receipt_event_required'; END IF;
 SELECT count(*),min("revision"),max("revision") INTO event_count,first_revision,last_revision FROM "branded_generation_receipt_events" WHERE "receiptId" = receipt."id";
 IF EXISTS (SELECT 1 FROM "branded_generation_receipt_events" WHERE "receiptId" = receipt."id" AND "isDeleted" IS DISTINCT FROM receipt."isDeleted") THEN RAISE EXCEPTION 'receipt_event_tombstone_mismatch'; END IF;
 IF event_count <> receipt."revision"::bigint + 1 OR first_revision <> 0 OR last_revision <> receipt."revision" THEN RAISE EXCEPTION 'receipt_event_gap'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER branded_generation_receipt_atomic AFTER INSERT OR UPDATE ON "branded_generation_receipts" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION branded_generation_receipt_atomic();
CREATE FUNCTION branded_generation_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'receipt_event_immutable'; END IF;
 IF (to_jsonb(NEW) - 'isDeleted') IS DISTINCT FROM (to_jsonb(OLD) - 'isDeleted') OR OLD."isDeleted" OR NOT NEW."isDeleted" OR
 NOT EXISTS (SELECT 1 FROM "branded_generation_receipts" WHERE "id" = NEW."receiptId" AND "organizationId" = NEW."organizationId" AND "brandId" = NEW."brandId" AND "isDeleted") THEN RAISE EXCEPTION 'receipt_event_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER branded_generation_event_immutable BEFORE UPDATE OR DELETE ON "branded_generation_receipt_events" FOR EACH ROW EXECUTE FUNCTION branded_generation_event_immutable();
CREATE FUNCTION branded_generation_event_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "branded_generation_receipts" WHERE "id" = NEW."receiptId" AND "organizationId" = NEW."organizationId" AND "brandId" = NEW."brandId" AND "revision" = NEW."revision" AND "projection" = NEW."projection") THEN RAISE EXCEPTION 'receipt_event_without_mutation'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER branded_generation_event_atomic AFTER INSERT ON "branded_generation_receipt_events" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION branded_generation_event_atomic();
CREATE FUNCTION branded_generation_prompt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."brandedGenerationReceiptId" IS NULL AND (TG_OP = 'DELETE' OR NEW."brandedGenerationReceiptId" IS NULL) THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'receipt_prompt_immutable'; END IF;
 IF OLD."retentionState" = 'purged' AND OLD."isDeleted" AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
 IF (to_jsonb(NEW) - ARRAY['ciphertext','retentionState','isDeleted']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['ciphertext','retentionState','isDeleted']) OR
 OLD."retentionState" <> 'retained' OR NEW."retentionState" <> 'purged' OR NEW."ciphertext" <> '' OR NOT NEW."isDeleted" OR OLD."isDeleted" THEN RAISE EXCEPTION 'receipt_prompt_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER branded_generation_prompt_immutable BEFORE UPDATE OR DELETE ON "generation_prompt_snapshots" FOR EACH ROW EXECUTE FUNCTION branded_generation_prompt_immutable();
