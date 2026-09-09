-- Capture transitions at the persistence boundary, including worker/direct Prisma writes.
-- Do not backfill old rows with invented completion dates.
CREATE FUNCTION capture_ingredient_generation_times() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'PROCESSING' THEN
      NEW."generationStartedAt" := COALESCE(NEW."generationStartedAt", CURRENT_TIMESTAMP);
    ELSIF NEW.status = 'GENERATED' THEN
      NEW."generationCompletedAt" := COALESCE(NEW."generationCompletedAt", CURRENT_TIMESTAMP);
    END IF;
  ELSE
    IF NEW.status = 'PROCESSING' AND OLD.status IS DISTINCT FROM NEW.status THEN
      NEW."generationStartedAt" := CURRENT_TIMESTAMP;
      NEW."generationCompletedAt" := NULL;
    ELSIF NEW.status IN ('GENERATED', 'FAILED') AND OLD.status IS DISTINCT FROM NEW.status THEN
      NEW."generationCompletedAt" := COALESCE(NEW."generationCompletedAt", CURRENT_TIMESTAMP);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER ingredient_generation_times BEFORE INSERT OR UPDATE OF status
ON ingredients FOR EACH ROW EXECUTE FUNCTION capture_ingredient_generation_times();
CREATE INDEX ingredients_generation_email_scan_idx ON ingredients ("organizationId", "generationCompletedAt", id) WHERE "isDeleted" = false AND "parentId" IS NULL;
