---
name: new-model
description: |
  Add a new AI generation model (Replicate, fal.ai, etc.) to the Genfeed.ai cloud platform.
  Covers model key registration, capabilities, prompt builder, schema sync, pricing, and
  optional workflow-UI integration. Use when integrating a new image/video/voice model.
  Triggers on: 'new model', 'add model', 'integrate model', '/new-model', 'new ai model'.
version: 1.0.0
tags:
  - ai-models
  - replicate
  - fal
  - generation
  - cloud
---

# new-model

Add a new AI generation model to the Genfeed.ai cloud platform.

## Arguments

```
/new-model <model-id> <category> [--provider replicate|fal] [--cost <usd>] [--dedicated]
```

- `model-id` — Provider model ID: `google/imagen-4-ultra`, `fal-ai/flux-pro`, `luma/ray-2`
- `category` — One of: `image`, `video`, `voice`, `music`
- `--provider` — `replicate` (default) or `fal`
- `--cost` — Per-run USD cost (for known pricing)
- `--dedicated` — Flag to create a dedicated prompt builder (vs generic fallback)

## Derived Names

| Pattern | Example for `google/imagen-4-ultra` |
|---------|-------------------------------------|
| Constant key | `REPLICATE_GOOGLE_IMAGEN_4_ULTRA` |
| Model ID | `google/imagen-4-ultra` |
| Brand org | `google` |
| Schema file | `imagen-4-ultra.schema.json` |
| Interface name | `Imagen4UltraInput` |
| Builder method | `buildImagen4UltraPrompt` |

## Pre-Flight Checks

Before writing any file:
1. Confirm model ID not already in `packages/constants/src/model-keys.constant.ts`
2. Check if brand org exists in `packages/constants/src/model-brands.constant.ts`
3. Check if model is already auto-discovered in DB (may exist as `isActive: false`)
4. Ask user: dedicated prompt builder or generic? (generic reads schema JSON at runtime)

---

## Quick Path Reference

| Layer | File | When |
|-------|------|------|
| 1. Model Key | `packages/constants/src/model-keys.constant.ts` | Always |
| 2. Capabilities | `packages/constants/src/model-capabilities.constant.ts` | Always |
| 3. Aspect Ratios | `packages/constants/src/model-aspect-ratios.constant.ts` | If new ratio set |
| 4. Model Brand | `packages/constants/src/model-brands.constant.ts` | If new org |
| 5. Input Interface | `apps/server/api/src/services/prompt-builder/interfaces/replicate-input.interface.ts` | If dedicated builder |
| 6. Prompt Builder | `apps/server/api/src/services/prompt-builder/builders/replicate/replicate-{category}.builder.ts` | If dedicated builder |
| 7. Schema Sync | `scripts/sync-replicate-schemas.ts` | Replicate models |
| 8. Pricing | `apps/server/workers/src/services/model-pricing.service.ts` | If cost known |
| 9. Router Default | `apps/server/api/src/services/router/router.service.ts` | If should be category default |
| 10. Input Parsing | `apps/server/api/src/services/integrations/replicate/replicate.service.ts` | If non-standard input format |
| 11. DB Activation | Admin API or direct DB | Always |
| 12. Workflow UI Types | `packages/types/src/nodes/ai-nodes.ts` | If canvas support |
| 13. Workflow UI Registry | `packages/workflow-ui/src/lib/models/registry.ts` | If canvas support |

---

## Layer 1: Model Key Constant (REQUIRED)

**File:** `packages/constants/src/model-keys.constant.ts`

Add to `MODEL_KEYS` object (alphabetical within provider section):
```typescript
REPLICATE_GOOGLE_IMAGEN_4_ULTRA: 'google/imagen-4-ultra',
// or for fal:
FAL_FLUX_PRO: 'fal-ai/flux-pro',
```

`ModelKeyValue` union type is auto-derived from this object — no extra change.

**Note:** There is no `ModelKey` enum. `packages/enums/src/model.enum.ts` only has `ModelProvider`, `ModelCategory`, `QualityTier`, `CostTier`, `SpeedTier`, `PricingType`.

---

## Layer 2: Model Capabilities (REQUIRED)

**File:** `packages/constants/src/model-capabilities.constant.ts`

Add entry to `MODEL_OUTPUT_CAPABILITIES` keyed by `MODEL_KEYS.YOUR_KEY`:

### Image model:
```typescript
[MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA]: {
  aspectRatios: ASPECT_RATIOS.IMAGEN,
  category: ModelCategory.IMAGE,
  defaultAspectRatio: '1:1',
  isBatchSupported: false,
  isImagenModel: true,
  maxOutputs: 4,
  maxReferences: 1,
} satisfies ImageModelCapability,
```

### Video model:
```typescript
[MODEL_KEYS.REPLICATE_LUMA_RAY_2]: {
  aspectRatios: ASPECT_RATIOS.STANDARD_VIDEO,
  category: ModelCategory.VIDEO,
  defaultAspectRatio: '16:9',
  defaultDuration: 5,
  durations: [5, 10],
  hasEndFrame: false,
  hasSpeech: false,
  hasResolutionOptions: false,
  isBatchSupported: false,
  maxReferences: 1,
} satisfies VideoModelCapability,
```

Use existing capability interfaces: `ImageModelCapability`, `VideoModelCapability`, `VideoEditModelCapability`.

---

## Layer 3: Aspect Ratios (IF NEW SET NEEDED)

**File:** `packages/constants/src/model-aspect-ratios.constant.ts`

Only if model has a unique ratio set not covered by existing constants:
- `ASPECT_RATIOS.IMAGEN` — Google Imagen models
- `ASPECT_RATIOS.FLUX_STANDARD` — Flux models
- `ASPECT_RATIOS.STANDARD_VIDEO` — Most video models
- etc.

```typescript
NUEVO: [
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
],
```

---

## Layer 4: Model Brand (IF NEW ORG)

**File:** `packages/constants/src/model-brands.constant.ts`

Only if model org not already listed. Existing orgs: `black-forest-labs`, `bytedance`, `deepseek-ai`, `fal-ai`, `genfeed-ai`, `google`, `heygen`, `hf`, `ideogram-ai`, `kwaivgi`, `luma`, `meta`, `openai`, `prunaai`, `qwen`, `replicate`, `runwayml`, `topazlabs`, `wan-video`, `x-ai`.

```typescript
'new-org': { label: 'New Org', color: '#6366f1' },
```

---

## Layer 5: Input Interface (IF DEDICATED BUILDER)

**File:** `apps/server/api/src/services/prompt-builder/interfaces/replicate-input.interface.ts`

```typescript
export interface Imagen4UltraInput extends BaseImageInput {
  output_format: string;
  safety_filter_level: string;
  // model-specific fields
}
```

Update the union type at bottom:
```typescript
export type ReplicateImageInput =
  | FluxInput
  | Imagen4UltraInput  // add here
  | IdeogramInput;
```

---

## Layer 6: Prompt Builder (IF DEDICATED)

**For image models:**
**File:** `apps/server/api/src/services/prompt-builder/builders/replicate/replicate-image.builder.ts`

1. Add key to `DEDICATED_MODELS` Set
2. Add `case` to `buildDedicatedPrompt` switch
3. Implement private builder method:

```typescript
private buildImagen4UltraPrompt(
  prompt: string,
  options: ImageGenerationOptions,
): Imagen4UltraInput {
  return {
    prompt,
    aspect_ratio: options.aspectRatio ?? '1:1',
    output_format: 'webp',
    safety_filter_level: 'block_medium_and_above',
    // model-specific defaults
  };
}
```

**For video models:**
**File:** `apps/server/api/src/services/prompt-builder/builders/replicate/replicate-video.builder.ts`

1. Add to `getSupportedModels()` array
2. Add `case` to `buildPrompt` switch
3. Implement private builder method

**SKIP this layer** if model follows standard conventions (`prompt`, `aspect_ratio`, `output_format`, `seed`). Generic builder reads schema JSON automatically for non-dedicated models.

---

## Layer 7: Schema Sync (REPLICATE MODELS ONLY)

**File:** `scripts/sync-replicate-schemas.ts`

Add model ID to `REPLICATE_MODELS` array:
```typescript
'google/imagen-4-ultra',
```

Run sync:
```bash
REPLICATE_KEY=r8_xxx bun scripts/sync-replicate-schemas.ts
```

Writes schema to: `apps/server/api/src/services/integrations/replicate/schemas/imagen-4-ultra.schema.json`

Generic builder reads this at runtime for `output_format`, `seed`, `resolution`, image ref fields.

**fal.ai models skip this** — fal handles schemas differently via `FalDiscoveryService`.

---

## Layer 8: Model Pricing (IF COST KNOWN)

**File:** `apps/server/workers/src/services/model-pricing.service.ts`

Add to `REPLICATE_KNOWN_COSTS`:
```typescript
'google/imagen-4-ultra': 0.08,
```

Triggers margin-based pricing: `providerCostUsd / 0.30` converted to credits.
Without this, falls back to category-tier average from `CATEGORY_TIER_MAP`.

---

## Layer 9: Router Default (IF CATEGORY DEFAULT)

**File:** `apps/server/api/src/services/router/router.service.ts`

Only if model should be hardcoded fallback when DB has no `isDefault: true` for category:
```typescript
const fallbacks: Record<ModelCategory, string> = {
  [ModelCategory.IMAGE]: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
  // ...
};
```

Skip for normal models — DB `isDefault` flag drives defaults.

---

## Layer 10: Input Parsing (IF NON-STANDARD)

**File:** `apps/server/api/src/services/integrations/replicate/replicate.service.ts`

Only if model needs special input format (like VEO-3's JSON-wrapped prompts with `elements.speech`). Add case to `parseReplicateInput()`.

Most models skip this.

---

## Layer 11: DB Activation (REQUIRED)

No static seed file. Models enter DB via:
- **Auto-discovery:** `CronModelWatcherService` (weekly, Sunday 6am UTC) for verified Replicate owners + fal.ai
- **Manual creation:** Admin API using `ModelsService.create()` / `CreateModelDto`

After model exists in DB, activate:
1. Set `isActive: true`
2. Populate capability fields in `config` JSON column:
   - `maxOutputs`, `maxReferences`, `isBatchSupported`
   - `aspectRatios`, `defaultAspectRatio`
   - `durations`, `defaultDuration` (video)
   - `hasEndFrame`, `hasSpeech`, `hasResolutionOptions` (video)
3. Set scoring fields: `costTier`, `speedTier`, `qualityTier`
4. Set `capabilities[]`, `recommendedFor[]`, `supportsFeatures[]`

### Create GitHub tracking issue:
```bash
bash scripts/sh/gh-issue-create-model.sh \
  --model "google/imagen-4-ultra" \
  --category image \
  --cost 0.08 \
  --fields "prompt,aspect_ratio,output_format" \
  --ratios "1:1,16:9,9:16,4:3,3:4" \
  --refs "https://replicate.com/google/imagen-4-ultra"
```

---

## Layer 12: Workflow UI Types (OPTIONAL — canvas support)

**File:** `packages/types/src/nodes/ai-nodes.ts`

Add to `ImageModel` or `VideoModel` union:
```typescript
export type ImageModel = 'nano-banana' | 'nano-banana-pro' | 'imagen-4-ultra';
```

---

## Layer 13: Workflow UI Registry (OPTIONAL — canvas support)

**File:** `packages/workflow-ui/src/lib/models/registry.ts`

Add to `IMAGE_MODELS` or `VIDEO_MODELS` array:
```typescript
{ apiId: 'google/imagen-4-ultra', label: 'Imagen 4 Ultra', value: 'imagen-4-ultra' },
```

Then regenerate types:
```bash
bun run sync:replicate
```

---

## Minimum Checklist by Provider

### Replicate image model (generic builder)
1. Model key constant
2. Capabilities constant
3. Schema sync script + run
4. Pricing (if known)
5. DB activation
6. GitHub issue

### Replicate image model (dedicated builder)
1. Model key constant
2. Capabilities constant
3. Input interface
4. Dedicated prompt builder method
5. Schema sync script + run
6. Pricing (if known)
7. DB activation
8. GitHub issue

### Replicate video model
1. Model key constant
2. Capabilities constant (with durations, speech, etc.)
3. Aspect ratios (if new set)
4. Input interface
5. Video prompt builder method
6. Input parsing (if non-standard like VEO-3)
7. Schema sync script + run
8. Pricing (if known)
9. DB activation
10. GitHub issue

### fal.ai model (any category)
1. Model key constant
2. Capabilities constant
3. DB activation (auto-discovered by `FalDiscoveryService`)
4. GitHub issue

**Note:** fal.ai models route through `ReplicatePromptBuilder` via `getProviderFromModelKey()` returning `ModelProvider.REPLICATE`. Generic builder handles them automatically. No schema sync needed.

### Canvas workflow support (optional, any provider)
- `packages/types/src/nodes/ai-nodes.ts` — union type
- `packages/workflow-ui/src/lib/models/registry.ts` — registry array
- `bun run sync:replicate` — regenerate types

---

## Post-Integration Verification

```bash
# Type check
bun type-check

# Test prompt builder
bun run test --filter=@genfeedai/api -- --grep "prompt-builder"

# Test model pricing
bun run test --filter=@genfeedai/workers -- --grep "model-pricing"

# Verify schema file exists (Replicate only)
ls apps/server/api/src/services/integrations/replicate/schemas/<model-name>.schema.json

# Verify constant exports
bun run test --filter=@genfeedai/constants
```
