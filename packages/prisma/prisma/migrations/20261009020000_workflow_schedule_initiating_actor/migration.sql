-- Nullable server-owned configuration capture. Existing Cloud schedules remain unbound until reconfigured.
ALTER TABLE "workflows" ADD COLUMN "scheduleInitiatingActor" JSONB;
