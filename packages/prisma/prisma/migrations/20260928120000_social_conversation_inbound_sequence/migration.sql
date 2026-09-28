-- Read cursor for social inbox read receipts.
--
-- `inboundSequence` counts inbound messages ingested into a conversation and
-- only ever increases. A read receipt sends the value its view rendered; the
-- server keeps every reply ingested after that view unread, so a stale tab
-- can no longer clear a reply it never displayed. Existing rows start at 0:
-- receipts only compare the rendered value with the current one, so no
-- backfill is needed.
ALTER TABLE "social_conversations"
  ADD COLUMN "inboundSequence" INTEGER NOT NULL DEFAULT 0;
