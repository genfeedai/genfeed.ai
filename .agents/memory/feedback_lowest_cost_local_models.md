---
name: lowest_cost_local_models
description: Local, self-hosted, and e2e default to FLUX Schnell, P-Video, and DeepSeek V4 Flash — cloud production uses Nano Banana 2 Lite and MiniMax H3
type: feedback
---

# Lowest-cost models for local / e2e

**Rule:** Local development, self-hosted installs, `NODE_ENV=test`, cloud staging, and an unset `NODE_ENV` must default image, video, and agent chat to the cheapest curated keys. Cloud production (`isCloud` + `NODE_ENV=production`) keeps the quality catalogue defaults.

| Surface | Local / e2e / self-hosted | Cloud production |
|---|---|---|
| Image | `black-forest-labs/flux-schnell` ($0.003) | Nano Banana 2 Lite ($0.034) |
| Video | `prunaai/p-video` ($0.02/s) | MiniMax H3 ($0.08/s at 768P; $0.13/s at 2K) |
| Chat | `deepseek/deepseek-v4-flash-0731` | Gemini 2.5 Flash Lite |

**Why:** Cloud quality defaults still burn real Replicate / OpenRouter spend on testing. The operator asked to keep local and e2e on the cheapest models while using cost-ranked cloud defaults.

**How to apply:**

- Keys live in `packages/contracts/src/constants/lowest-cost-models.constant.ts`.
- `shouldUseLowestCostModelDefaults({ isCloud, nodeEnv })` is true unless `isCloud && nodeEnv === 'production'`. Cloud staging and an unset `NODE_ENV` use the cheapest keys.
- `getModelCatalogForDeployment(false)` remaps `isDefault` onto those keys; the model catalog seed writes that list off cloud production.
- Frontend `EnvironmentService.MODELS_DEFAULT` and empty-registry router fallbacks use the same keys.
- Self-hosted workspace seed fills empty org/brand `defaultImageModel` / `defaultVideoModel` / `defaultModel`. Do not overwrite an operator-chosen model on later boots.
- Do not flip `SELF_HOSTED_MODELS` / `UNIFIED_MODEL_CATALOG` cloud `isDefault` to the cheap keys — that would change SaaS product defaults.
