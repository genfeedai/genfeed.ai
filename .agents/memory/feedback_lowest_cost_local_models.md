---
name: lowest_cost_local_models
description: Development, staging and e2e use cheap defaults; production uses current quality media defaults
type: feedback
last_verified: 2026-10-07
---

# Lowest-cost models for local / e2e

**Rule:** Local development, `NODE_ENV=test`, staging, and an unset `NODE_ENV` use inexpensive curated defaults. All production deployments (`NODE_ENV=production`), including self-hosted, keep current quality media defaults. Hosted FLUX.1 is legacy in production; see [media benchmark policy](feedback_media_model_benchmark_policy.md).

| Surface | Development / staging / e2e | Production |
|---|---|---|
| Image | `black-forest-labs/flux-schnell` ($0.003) | Nano Banana 2 Lite ($0.034) |
| Video | `prunaai/p-video` ($0.02/s) | MiniMax H3 ($0.08/s at 768P; $0.13/s at 2K) |
| Chat | `deepseek/deepseek-v4-flash-0731` | DeepSeek V4 Flash |

**Why:** Cloud quality defaults still burn real Replicate / OpenRouter spend on testing. The operator asked to keep local and e2e on the cheapest models while using cost-ranked cloud defaults.

**How to apply:**

- Keys live in `packages/contracts/src/constants/lowest-cost-models.constant.ts`.
- `shouldUseLowestCostModelDefaults({ isCloud, nodeEnv })` is true unless `nodeEnv === 'production'`. Staging and an unset `NODE_ENV` use the cheapest keys.
- `getModelCatalogForDeployment(false)` remaps `isDefault` onto those keys; the model catalog seed writes that list outside production.
- Frontend `EnvironmentService.MODELS_DEFAULT` and empty-registry router fallbacks use the same keys.
- Workspace seed fills empty org/brand model defaults for its environment. Do not overwrite an operator-chosen model on later boots.
- Do not flip `SELF_HOSTED_MODELS` / `UNIFIED_MODEL_CATALOG` cloud `isDefault` to the cheap keys — that would change SaaS product defaults.
