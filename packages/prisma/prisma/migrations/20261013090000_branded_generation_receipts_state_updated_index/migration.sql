-- Scheduled dispatch-window recovery (#5786) looks for receipts that stayed
-- `resolved` past the window across every tenant, oldest first. Without this
-- index the sweep scans the whole table; the table grows with every branded
-- generation. Additive and non-blocking for readers.
CREATE INDEX IF NOT EXISTS "branded_generation_receipts_state_updated_idx" ON "branded_generation_receipts"("state", "updatedAt");
