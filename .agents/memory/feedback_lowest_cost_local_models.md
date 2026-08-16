---
name: lowest_cost_local_models
description: Local, self-hosted, and e2e default to FLUX Schnell, P-Video, and DeepSeek V4 Flash — cloud production keeps quality defaults
type: feedback
---

# Lowest-cost models for local / e2e

**Rule:** Local development, self-hosted installs, and `NODE_ENV=test` must default image, video, and agent chat to the cheapest curated keys. Cloud production keeps the quality catalogue defaults.

| Surface | Local / e2e / self-hosted | Cloud production |
|---|---|---|
| Image | `black-forest-labs/flux-schnell` ($0.003) | Nano Banana ($0.039) |
| Video | `prunaai/p-video` ($0.02/s) | Seedance 2.5 ($0.24/s) |
| Chat | `deepseek/deepseek-v4-flash-0731` | Gemini 2.5 Flash Lite |

**Why:** Flagship defaults (Nano Banana, Seedance 2.5, Veo, Imagen 3) burn real Replicate / OpenRouter spend on testing. The operator asked to keep local and e2e on the cheapest models.

**How to apply:**

- Keys live in `packages/constants/src/lowest-cost-models.constant.ts`.
- `shouldUseLowestCostModelDefaults({ isCloud, nodeEnv })` is true for `development`, `test`, and any non-cloud deploy.
- `getModelCatalogForDeployment(false)` remaps `isDefault` onto those keys; the model catalog seed writes that list off cloud production.
- Frontend `EnvironmentService.MODELS_DEFAULT` and empty-registry router fallbacks use the same keys.
- Self-hosted workspace seed fills empty org/brand `defaultImageModel` / `defaultVideoModel` / `defaultModel`. Do not overwrite an operator-chosen model on later boots.
- Do not flip `SELF_HOSTED_MODELS` / `UNIFIED_MODEL_CATALOG` cloud `isDefault` to the cheap keys — that would change SaaS product defaults.
