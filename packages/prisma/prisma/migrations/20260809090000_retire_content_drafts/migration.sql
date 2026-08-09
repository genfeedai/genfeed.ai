-- Runtime writes now use canonical posts. Preserve every historical row for
-- the dry-run-first, resumable operator migration instead of dropping unknown
-- content during deploy. Keep the physical name stable so older instances in
-- a rolling deployment do not fail before the new runtime has cut over.
COMMENT ON TABLE "content_drafts" IS
  'Read-only archive retired by issue #2643; migrate with apps/server/api/scripts/retire-content-drafts.ts.';
