# Review decision normalization

Review decisions use one lowercase product vocabulary: `unset`, `approved`,
`rejected`, and `request_changes`. The existing Postgres `ReviewDecision` enum
labels remain uppercase for database wire compatibility; application writes use
the explicit `PersistedReviewDecision` mapping and serializers always project
the lowercase product value.

Historical JSON in `batches.items` and `posts.reviewEvents` can be inspected and
normalized with the API package commands:

```bash
bun --filter @genfeedai/api migrate:review-decisions:dry
bun --filter @genfeedai/api migrate:review-decisions
```

Dry-run is the default. Both modes paginate by stable ID, scope updates by
organization and soft-delete state, and guard writes with the original JSON and
`updatedAt` value so concurrent changes are not overwritten. Re-running after a
successful live pass is a no-op.

The normalizer maps only the three documented uppercase aliases. Missing values
become explicit `unset`. Unknown values remain untouched and are reported as a
value type plus a short SHA-256 category; raw historical content is never
printed. Runtime readers also fail closed by projecting unknown values to
`unset`, so an unknown value cannot become approval. A live run exits non-zero
while unknown categories or concurrent changes remain; investigate those rows,
repair them deliberately, and rerun the dry-run before applying again.
