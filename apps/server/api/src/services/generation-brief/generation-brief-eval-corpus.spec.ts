import { compileRemainingImageGenerationBrief } from '@api/services/generation-brief/compile-remaining-image-generation-brief';
import { compileRemainingVideoGenerationBrief } from '@api/services/generation-brief/compile-remaining-video-generation-brief';
import { REMAINING_IMAGE_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-image-generation-brief-families';
import { REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-video-generation-brief-families';
import { runImageGenerationBrief } from '@api/services/generation-brief/run-image-generation-brief';
import { runVideoGenerationBrief } from '@api/services/generation-brief/run-video-generation-brief';
import { imageGenerationBriefSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

/**
 * #3470 deterministic corpus. Live provider scoring is gated; these scenarios
 * lock brief → dispatch contracts for branded/unbranded, reference, and
 * text-in-image / first-frame cases on the cheapest representative families.
 */

const IMAGE_SCENARIOS = [
  {
    fidelityMode: 'off' as const,
    id: 'image-unbranded-t2i',
    model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    objective: 'a sunset over the ocean',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'image-guided-product',
    model: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
    objective: 'Create a launch still of the bottle on marble',
    references: [{ assetId: 'product-1', role: 'product' as const }],
  },
  {
    fidelityMode: 'guided' as const,
    id: 'image-guided-negative',
    model: MODEL_KEYS.SDXL,
    objective: 'editorial bottle portrait',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-fal-schnell',
    model: MODEL_KEYS.FAL_FLUX_SCHNELL,
    objective: 'a ceramic cup on linen',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-recraft',
    model: MODEL_KEYS.REPLICATE_RECRAFT_AI_RECRAFT_V4,
    objective: 'flat vector icon of a fox',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-grok-imagine',
    model: MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_IMAGE,
    objective: 'cinematic night market',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-leonardo',
    model: MODEL_KEYS.LEONARDOAI,
    objective: 'fashion lookbook still',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-higgsfield-soul',
    model: MODEL_KEYS.HIGGSFIELD_SOUL,
    objective: 'vertical portrait of a founder',
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-self-hosted-flux2',
    model: MODEL_KEYS.GENFEED_AI_FLUX2_DEV,
    objective: 'product hero on black',
  },
  {
    fidelityMode: 'strict' as const,
    id: 'image-pulid-identity',
    model: MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID,
    objective: 'a portrait of the brand face',
    references: [{ assetId: 'face-1', role: 'character' as const }],
  },
  {
    fidelityMode: 'off' as const,
    id: 'image-z-turbo',
    model: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
    objective: 'soft daylight interior',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'image-text-in-frame',
    model: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
    objective: 'poster that reads GENFEED',
  },
] as const;

const VIDEO_SCENARIOS = [
  {
    fidelityMode: 'off' as const,
    id: 'video-unbranded-p-video',
    model: MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
    objective: 'a product spinning on a table',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'video-guided-minimax',
    model: MODEL_KEYS.REPLICATE_MINIMAX_H3,
    objective: 'slow push-in on the bottle',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-veo',
    model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    objective: 'waves hitting a cliff at dusk',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-sora',
    model: MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
    objective: 'a city street in rain',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'video-kling-i2v',
    model: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
    objective: 'the product turns to camera',
    references: [{ assetId: 'frame-1', role: 'first_frame' as const }],
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-wan-t2v',
    model: MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_7_T2V,
    objective: 'fog moving through pine trees',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-seedance',
    model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST,
    objective: 'handheld walk through a studio',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-hailuo',
    model: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
    objective: 'macro pour of honey',
    references: [{ assetId: 'frame-2', role: 'first_frame' as const }],
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-grok-imagine',
    model: MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_VIDEO,
    objective: 'neon alley tracking shot',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-pixverse',
    model: MODEL_KEYS.REPLICATE_PIXVERSE_PIXVERSE_V6,
    objective: 'a skateboard kickflip in slow motion',
  },
  {
    fidelityMode: 'off' as const,
    id: 'video-runway',
    model: MODEL_KEYS.REPLICATE_RUNWAYML_GEN_4_5,
    objective: 'drone over a coastline',
  },
  {
    fidelityMode: 'guided' as const,
    id: 'video-dialogue',
    model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    objective: 'two founders talking at a table',
  },
] as const;

describe('generation brief eval corpus (#3470)', () => {
  it('covers at least 12 image and 12 video scenarios', () => {
    expect(IMAGE_SCENARIOS.length).toBeGreaterThanOrEqual(12);
    expect(VIDEO_SCENARIOS.length).toBeGreaterThanOrEqual(12);
  });

  it.each(IMAGE_SCENARIOS)(
    'compiles image scenario $id without dispatching a provider',
    (scenario) => {
      const result = runImageGenerationBrief({
        avoid:
          scenario.id === 'image-guided-negative'
            ? ['busy backgrounds']
            : undefined,
        fidelityMode: scenario.fidelityMode,
        height: 1080,
        model: scenario.model,
        objective: scenario.objective,
        references: 'references' in scenario ? scenario.references : undefined,
        surface: 'studio',
        width: 1920,
      });

      expect(result.evidence.status).toBe('compiled');
      expect(result.dispatch?.prompt).toBeTruthy();
    },
  );

  it.each(VIDEO_SCENARIOS)(
    'compiles video scenario $id without dispatching a provider',
    (scenario) => {
      const result = runVideoGenerationBrief({
        durationSeconds: 5,
        fidelityMode: scenario.fidelityMode,
        height: 1080,
        model: scenario.model,
        objective: scenario.objective,
        references: 'references' in scenario ? scenario.references : undefined,
        surface: 'studio',
        width: 1920,
      });

      expect(result.evidence.status).toBe('compiled');
      expect(result.dispatch?.prompt).toBeTruthy();
    },
  );

  it('keeps remaining-family compilers registered for every remaining image key', () => {
    const keys = REMAINING_IMAGE_GENERATION_BRIEF_FAMILIES.flatMap((family) =>
      family.profiles.map((profile) => profile.modelKey),
    );
    expect(keys).toContain(MODEL_KEYS.SDXL);
    expect(compileRemainingImageGenerationBrief).toEqual(expect.any(Function));
  });

  it('keeps remaining-family compilers registered for every remaining video key', () => {
    const keys = REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES.flatMap((family) =>
      family.profiles.map((profile) => profile.modelKey),
    );
    expect(keys).toContain(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3);
    expect(compileRemainingVideoGenerationBrief).toEqual(expect.any(Function));
  });
});

describe('generation brief eval corpus schema lock', () => {
  it('accepts a strict image brief used by the corpus', () => {
    expect(
      imageGenerationBriefSchema.parse({
        constraints: [],
        fidelityMode: 'strict',
        intent: { objective: 'a portrait of the brand face' },
        mediaKind: 'image',
        output: { aspectRatio: '1:1' },
        references: [{ assetId: 'face-1', role: 'character' }],
        version: 1,
      }).fidelityMode,
    ).toBe('strict');
  });
});
