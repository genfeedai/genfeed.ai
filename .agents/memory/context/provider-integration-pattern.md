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
2. **Declare the key in all five places**, or agents and self-hosters cannot find it:
   Joi schema (`packages/config/src/schemas/ai.schema.ts`, `.optional()`), `ApiEnvConfig`
   (`packages/libs/config/config.service.ts`), `scripts/env-spec.ts`, `.env.example`
   (`scripts/env-check.ts` fails if those two disagree), and the table in
   `apps/docs/content/integrations/ai-providers.mdx`.
3. **Read config through `ConfigService`, never `process.env`.**
4. **No enable/disable env var.** `check:env-product-flags` rejects `*_ENABLED`-style product flags. A provider is
   available when its key exists (or the organization has a BYOK key) **and** a reviewed model row is active in the
   registry. The kill switch is deactivating the model in admin; accepted tasks keep draining.
5. **Pricing comes from reviewed tariffs** (`ModelProviderContract`, `reviewed-provider-rates-seed.ts`) with a frozen
   quote, not from the hard-coded rate sheet. If the vendor bills in its own credits, keep the credits-to-dollars
   conversion and its version label as constants beside the adapter (`crun-acquisition-rate.constant.ts`), never env.
   Customer-facing math is fixed: 1 Genfeed credit = $0.01.
6. **BYOK is optional per provider.** Add the provider to `ByokProvider` and to the right mapping in
   `apps/server/api/src/services/byok/byok-provider-map.util.ts` (`MODEL_PROVIDER_TO_BYOK`, the model-key prefix list,
   or the authoritative prefix list); a missing entry silently falls back to the platform key. Hosted-only providers
   (Kie) are not BYOK.
7. **Production secrets live in AWS SSM Parameter Store** at `/genfeed/production/<ENV_NAME>` as `SecureString`. The
   deploy injects each parameter as an env var named after the last path segment, and tasks read them only at deploy.
   Never put a secret in this repo or in `genfeedai/vault` (business notes, not secrets).
8. **Webhooks only with a verified signature scheme** from the vendor docs; otherwise poll.
9. **Hard-code the vendor base URL** unless it differs per deployment.

## Known inconsistencies (do not copy)

- Higgsfield, Apify, Kie and Crun keys are missing from some of the five places in rule 2.
- `onboarding-readiness.service.ts` reads provider keys from `process.env`.
- `api-key-helper.service.ts` (`ApiKeyCategory`) is a second key-resolution path beside `ByokService`.
- Older providers still price from the hard-coded rate sheet instead of reviewed tariffs.
