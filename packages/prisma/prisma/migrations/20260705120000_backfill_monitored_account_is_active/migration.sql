-- Move MonitoredAccount `isActive` out of the `config` JSON blob onto the
-- existing top-level `isActive` Boolean column. The service previously read AND
-- wrote the flag inside `config` (toggle + list filters), while a real
-- `isActive Boolean @default(true)` column sat unused and drifted — a split-brain
-- where `PATCH { isActive }` hit the wrong storage and had no visible effect.
--
-- After this migration the column is the single source of truth: the toggle
-- endpoint is removed and `PATCH /monitored-accounts/:id { isActive }` writes the
-- column directly. Semantics are preserved — the former filter treated a missing
-- flag as active (`(config.isActive ?? true) !== false`), which matches the
-- column's `@default(true)`; only rows that had `config.isActive = false`
-- meaningfully change the column.
--
-- `updatedAt` is intentionally NOT bumped: this relocates where the same flag
-- lives without changing any observable active/inactive state.

-- Backfill the column from the config blob, then strip the redundant key.
-- Scoped to rows that actually carry the key; COALESCE guards a malformed value.
UPDATE "monitored_accounts"
SET    "isActive" = COALESCE((config->>'isActive')::boolean, "isActive"),
       config     = config - 'isActive'
WHERE  config ? 'isActive';
