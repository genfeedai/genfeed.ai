# `posts.status` backfill runbook

Issue [#2600](https://github.com/genfeedai/genfeed.ai/issues/2600) repairs
historical `posts.status` strings that are not members of `PostStatus`. It does
not change `targetExecutionState` or any other post field.

## Current mapping

The issue's original `paused → scheduled` acceptance text predates the mapper
fix shipped in [#2582](https://github.com/genfeedai/genfeed.ai/pull/2582).
`PostGroupContractService.toPostStatus` is the source of truth used by both the
write path and this backfill:

| Invalid source status | Backfilled `PostStatus` |
| --- | --- |
| `paused`, `cancelled` | `draft` |
| `publishing` | `processing` |
| `published` | `public` |
| `partially-published` | `scheduled` |
| Any other invalid value, including `skipped` | `scheduled` |

Already-valid values (`public`, `private`, `unlisted`, `draft`, `scheduled`,
`processing`, `pending`, and `failed`) are never selected or rewritten.

## Safety properties

- Dry-run is the default; only `--live` enables writes.
- Invalid rows are read in ID-keyset batches (default 500, maximum 5,000).
- Live writes are grouped by original status and include that original status
  in the update predicate. A concurrent status change is skipped, not
  overwritten, and counted in `concurrentChangesSkipped`.
- Re-running is idempotent because valid `PostStatus` values are excluded.
- The report lists counts for every source-to-target mapping before the run and
  inventories any invalid values remaining afterward.
- `targetExecutionState` is neither selected nor written.

## Dry-run inventory

1. Use the exact release SHA intended for the eventual live run.
2. Resolve and verify the database target out of band. Never rely on an
   implicit shell profile; set `DATABASE_URL` explicitly for the intended
   environment.
3. Run the inventory without `--live` and retain the complete JSON report:

   ```bash
   bun run apps/server/api/scripts/backfill-post-status.ts --batch=500
   ```

4. Review every entry in `before`. In particular, confirm the default
   `scheduled` mapping is acceptable for every unrecognized source value.
   `updated` must be `0`, and `before` must equal `after` in dry-run mode.

Do not proceed if the database target is ambiguous, the report contains a
status whose mapping has not been approved, or a current backup/snapshot is not
available.

## Live apply

Run the same release SHA, database target, and batch size used for the reviewed
dry-run:

```bash
bun run apps/server/api/scripts/backfill-post-status.ts --live --batch=500
```

The command exits non-zero if any invalid rows remain after the apply pass or
if `concurrentChangesSkipped` is non-zero. In either case, inspect the report
and rerun the dry-run before retrying.

## Verification

Immediately rerun the default dry-run:

```bash
bun run apps/server/api/scripts/backfill-post-status.ts --batch=500
```

The verified terminal report has all of the following:

- `scanned: 0`
- `wouldUpdate: 0`
- `remainingInvalid: 0`
- empty `before` and `after` arrays

Retain the reviewed dry-run, live, and verification reports with the change
record. Production and staging execution are separate operator actions; this
repository change does not run the backfill automatically.
