---
name: data-change-protocol
description: Three channels for data changes — Prisma data migrations, deploy-time reference-data sync, local fixture seed
type: project
last_verified: 2026-10-14
---

# Seeding and data-change protocol

**Why:** Production data used to reach the database through boot upserts, data-only Prisma migrations, and hand-run scripts, with no rule for which channel a change belonged in. Reviewers could not tell where a value came from or whether it reached every environment.

**How to apply:** Read this file before adding a catalog row, a data migration, a fixture, or any script that writes to a database. Pick exactly one channel. Do not write reference data from API or worker process boot.

## Channels

1. **Data migrations** (`packages/prisma/prisma/migrations/`) carry one-time changes to existing tenant or product data. They are tracked by the migrations ledger and applied exactly once per environment. Use them for backfills, renames of tenant rows, and irreversible data repairs. Do not use them for code-owned catalogs that later releases must be able to correct.

2. **Reference-data sync** (`apps/server/api/src/seeds/reference-data-sync.entrypoint.ts`) carries code-owned catalogs. It is an idempotent reconcile that writes only seed-owned fields and preserves operator-owned fields. A second run with unchanged code performs no writes. Failure fails the hosted deploy before services roll, and fails self-hosted / local startup before traffic is served.

3. **Fixture seed** (`apps/server/api/scripts/seeds/local-debug-data.seed.ts`, wired as `prisma db seed`) carries local and test data only. It refuses hosted, production, and `GENFEED_CLOUD=true` environments.

## Choosing a channel

| Change | Channel |
| --- | --- |
| New or corrected model / rate / skill / Studio preset / studio element | Reference-data sync (edit the catalog in code) |
| One-time rewrite of existing tenant rows | Data migration |
| QA posts, brands, campaigns on a laptop | Fixture seed |
| External provider catalog (voices) | Application platform schedule |
| Runtime BullMQ job registration | Code (not a data seed) |
| Self-hosted first-boot workspace | Tenant fixture on API boot (`SelfHostedSeedService`) |

## Reference-data domains

| Domain | Seed-owned | Operator-owned |
| --- | --- | --- |
| Model catalog | Labels, categories, capability metadata, catalog lifecycle, curated cost/unit pricing | Activation, visibility, defaults, operator demotion (`isLegacy` / operator `RETIRED`) |
| Reviewed provider rates | Sheet hash, sheet rates, `rate-sheet` reviewer | Operator-approved contracts at or after the sheet verification date |
| First-party skills | Built-in identity, instructions, version, catalog origin | Organization-owned forks |
| Studio presets | Insert-if-missing platform templates | Activation, deletion, tenant forks |
| Studio elements | Insert-if-missing platform rows (deterministic id) | Renames, edits, activation, deletion |
| Font families | Insert-if-missing platform rows (deterministic id) | Renames, edits, deletion |
| Music defaults | `UNIFIED_MODEL_CATALOG` music entries (no extra seeder) | Same as model catalog |

A model row created by the sync is also offered once to every organization with an explicit `enabledModelIds` allowlist (allowlists are never merged on read); later syncs leave the allowlist alone, so a switched-off model stays off.

Historical data-only migrations `20261004100000_default_studio_elements`, `20261004110000_default_studio_elements_seed_by_id`, and `20261010083000_reconcile_music_catalog_default` stay applied. New catalog corrections go through the sync.

## When the sync runs

- **Hosted:** after `prisma migrate deploy`, before ECS services roll. Failure keeps the previous services serving.
- **Self-hosted:** after migrate in `docker/selfhosted-entrypoint.sh`, before Nest/Next processes start. Failure exits non-zero and names the domain.
- **Local:** after migrate + generate in `scripts/dev/prepare-local-database.ts` (API nest-fast-dev only).
- **CLI:** `bun --filter @genfeedai/api seed:reference-data --live`. `--validate-runtime` loads catalogs without a database (image/CI).

The sync is a compiled Nest one-off app (`api-reference-data-sync`). It is not imported by `AppModule`.

## Catalog-to-rate CI

`packages/pricing/src/reviewed-rates/reviewed-rate-sheet.spec.ts` fails when an active paid non-text catalog model has neither a reviewed rate entry nor an `UNPRICED_MODELS` marker, and names the model key. Product contracts stay in tests; do not add a named `check:*` CI YAML step.

## Inventory (owner decisions)

| Surface | Channel |
| --- | --- |
| `ModelCatalogSeedService` | Reference-data sync |
| `seedReviewedProviderRates` | Reference-data sync |
| `SkillCatalogSeedService` + `SkillLibraryService.backfillExistingOrganizations` | Reference-data sync (new orgs still get `assignSharedDefaults` on setup) |
| `StudioPresetSeedService` | Reference-data sync |
| Studio elements | Reference-data sync (`STUDIO_ELEMENT_CATALOG`) |
| Font families | Reference-data sync (`FONT_FAMILY_METADATA`, one row per shipped TTF) |
| Music catalog default | Model catalog domain |
| `SelfHostedSeedService` | Tenant fixture on API boot |
| `PlatformScheduleRegistryService` | Runtime BullMQ registration |
| External voices | Platform schedule `external-voice-catalog-sync` |
| `scripts/migrations/` production CLIs | Retired |

## Trust and failure

The sync runs with deploy credentials inside the deploy pipeline or container entrypoint, never from a developer machine against production. It logs one summary line per domain (`written`, `unchanged`, `failed`). Any failed domain exits 1 after every domain has been attempted.
