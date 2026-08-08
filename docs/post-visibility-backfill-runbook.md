# Post visibility backfill

Issue #2641 expands `posts` with an independent nullable `visibility` column.
The column stays nullable during rollout so historical `private` and `unlisted`
rows are never silently classified as public by a schema default.

## Sequence

1. Deploy the schema migration that adds `posts.visibility`.
2. Run the dry report:

   ```bash
   bun --filter @genfeedai/api migrate:post-visibility:dry
   ```

3. Review `rowsUpdated`, `visibilityUpdates`, `lifecycleUpdates`, and
   `unknownLegacyStatuses`. Unknown values fail closed to draft/public and must
   be investigated before a live run.
4. Apply the guarded backfill:

   ```bash
   bun --filter @genfeedai/api migrate:post-visibility
   ```

5. Re-run the dry command. It must report zero pending updates.

Use `--batch=<n>` when a smaller transaction footprint is required. The job is
idempotent and pages by stable Post id. Each live update also matches the
source status, lifecycle, and visibility values it classified; concurrent
changes are counted and make the run exit non-zero so a safe rerun can converge.

The script does not print Post content, provider payloads, or tenant data.
