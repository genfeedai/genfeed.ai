# Import provider media models

The importer collects the missing benchmark candidates identified on 2026-10-07
and media catalog entries without a reviewed rate-sheet entry. It fetches exact
Replicate/fal endpoint identities, full OpenAPI input and output schemas, and
provider pricing. Task variants remain separate on fal; Replicate model versions
are captured in each snapshot.

From the repository root, using Bun and the installed workspace dependencies:

```sh
bun run --cwd packages/helpers build
bun run --cwd packages/pricing build
bun scripts/models/import-provider-models.ts --output /absolute/path/import.json
```

Provide `REPLICATE_KEY` and `FAL_API_KEY` (or `FAL_KEY`) through the executing
environment. For an existing environment file, Bun supports
`bun --env-file=/absolute/path/env-file scripts/models/import-provider-models.ts ...`.
The command does not read an environment by deployment name or print credentials.

Use `--provider replicate` or `--provider fal` to filter; repeated `--model
owner/name` options select exact endpoints from the import manifest. The output
contains source URLs, observation timestamps, provider versions, schema defaults,
enums, required fields, limits, conditional prices, and mapping failures. Large
schemas stay in the report and provider contracts. No predictions are submitted.

fal model metadata is public, and schemas are fetched in small batches with
bounded retries. fal account pricing requires authentication. Without its key,
schemas are collected with explicit `missing_pricing` quarantine, never inferred
from another provider's prices. Retired or invalid catalog identities are reported
as failures, never silently substituted with newer model IDs.

For Replicate, the public model page's `billingConfig.current_tiers` is the pricing
source. The same mapper as the daily watcher resolves input/output units and
variants. FLUX 3 draft and video continuation use different prices; audio does not
select a billing variant. Unmapped billing tiers are retained as source evidence
with a quarantine reason. Price evidence is dated; temporary promotions and
minimum billing rules must be reviewed before approval.

## Write pending registry entries

After resolving the intended database, explicitly pass both write mode and the
exact host (including port, if present) and database path from `DATABASE_URL`:

```sh
bun scripts/models/import-provider-models.ts \
  --output /absolute/path/import.json \
  --live --database-target database-host:5432/database-name
```

Generate the Prisma client using the normal package prerequisite if necessary.
Each entry is written in a serializable transaction. New entries are inactive,
private, non-default, and pending. Provider contracts retain schemas and pricing;
unsupported or incomplete contracts are quarantined. Draft cost zero is an
unpriced sentinel, with `isFree=false` and no guessed `providerCostUsd`.

Existing approved runtime schemas, prices, activation, defaults and visibility
are preserved. An observed change becomes a pending snapshot. Deleted,
tenant-owned, or colliding identities fail without writes. Repeated imports update
the snapshot's last-seen date and do not alter its review decision. The report is
saved before writes and after each committed entry, so partial progress is visible.

Import does not approve a contract, activate a model, change routing tiers, or
qualify generation quality. Supported candidates use the registry's existing
approval path after reviewing schema compatibility and pricing evidence.

Official sources: [fal metadata](https://fal.ai/docs/platform-apis/v1/models),
[fal pricing](https://fal.ai/docs/platform-apis/v1/models/pricing), and
[Replicate models API](https://replicate.com/docs/reference/http#models.get).
