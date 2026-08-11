-- Lifecycle email trigger keys are now colon-free (`signup-{userId}`,
-- `checkout-{sessionId}`): they feed BullMQ custom job ids, and BullMQ
-- rejects ':' (its Redis key delimiter) — every schedule failed with
-- "Custom Id cannot contain :".
--
-- Rewrite persisted rows to the new format so the dedupe constraint
-- `lifecycle_email_deliveries_unique_step` keeps matching. No conflict is
-- possible: pre-fix code only ever wrote the ':' format, and this migration
-- runs before the colon-free writers deploy.

UPDATE "lifecycle_email_deliveries"
SET "triggerKey" = replace("triggerKey", ':', '-')
WHERE "triggerKey" LIKE '%:%';
