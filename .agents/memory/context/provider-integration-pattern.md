---
name: Provider integration pattern
description: How to add or change an AI/media provider (key, env declaration, enable gate, pricing, BYOK, secrets); read before touching any provider adapter or provider env var.
type: reference
---

One pattern for every hosted provider. Copy Crun (`apps/server/api/src/services/integrations/crun/`) or Kie
(`.../integrations/kie/`) for a new one, and search for an existing adapter of the same media kind first.

## Rules

1. **Key name:** `<PROVIDER>_API_KEY` (plus `_API_SECRET` only if the vendor issues a pair). Older names
   (`REPLICATE_KEY`, `KLINGAI_KEY`, `LEONARDO_KEY`, `HEYGEN_KEY`, `HEDRA_KEY`, `ARGIL_KEY`, `APIFY_API_TOKEN`) stay as they are; do not rename or copy them.
2. **Declare the key in four places, plus the docs table.** `bun run check:provider-key-declarations` (part of
   `check:architecture`) fails when code reads a credential-shaped key (`<PROVIDER>_API_KEY`, `_KEY`, `_API_TOKEN`,
   `_SECRET`) that is missing from any of: `scripts/env-spec.ts`, `.env.example`, a Joi schema in
   `packages/config/src/schemas/` (`.optional()`), and the env typing (`packages/config/src/interfaces/env-config.interface.ts`
   or `ApiEnvConfig`). Add the key to the table in `apps/docs/content/integrations/ai-providers.mdx` too (not enforced).
3. **Read config through `ConfigService`, never `process.env`.**
4. **No enable/disable env var.** `check:env-product-flags` rejects `*_ENABLED`-style product flags. A provider is
   available when its key exists (or the organization has a BYOK key) **and** a reviewed model row is active in the
   registry. The kill switch is deactivating the model in admin; accepted tasks keep draining.
5. **Pricing comes from reviewed tariffs** (`ModelProviderContract`, `reviewed-provider-rates-seed.ts`) with a frozen
   quote, not from the hard-coded rate sheet. If the vendor bills in its own credits, keep the credits-to-dollars
   conversion and its version label as constants beside the adapter (`crun-acquisition-rate.constant.ts`), never env.
   Customer-facing math is fixed: 1 Genfeed credit = $0.01.
6. **BYOK is optional per provider.** Add the provider to `ByokProvider` and one row to `BYOK_MODEL_ROUTES` in
   `apps/server/api/src/services/byok/byok-provider-map.util.ts` (catalog `modelProvider`, `modelKeyPrefixes`, or
   `authoritativeModelKeyPrefixes`). A provider with no row silently falls back to the platform key, so the spec fails
   until every `ByokProvider` and `ModelProvider` is either routed or listed with a reason. Hosted-only providers
   (Kie, Mureka) are not BYOK.
7. **Production secrets live in AWS SSM Parameter Store** at `/genfeed/production/<ENV_NAME>` as `SecureString`. The
   deploy injects each parameter as an env var named after the last path segment, and tasks read them only at deploy.
   Never put a secret in this repo or in `genfeedai/vault` (business notes, not secrets).
8. **Webhooks only with a verified signature scheme** from the vendor docs; otherwise poll.
9. **Hard-code the vendor base URL** unless it differs per deployment.

## Known inconsistencies (do not copy)

- `api-key-helper.service.ts` (`ApiKeyCategory`) is a second key-resolution path beside `ByokService`
  (ElevenLabs, Hedra, HeyGen).
- Older providers still price from the hard-coded rate sheet instead of reviewed tariffs.
- Key names predate rule 1 (`REPLICATE_KEY`, `KLINGAI_KEY`, ...); `check:provider-key-declarations` accepts both shapes.
