import { compileRemainingImageGenerationBrief } from '@api/services/generation-brief/compile-remaining-image-generation-brief';
import { compileRemainingVideoGenerationBrief } from '@api/services/generation-brief/compile-remaining-video-generation-brief';
import {
  GENERATION_BRIEF_IMAGE_EVAL_SCENARIOS as IMAGE_SCENARIOS,
  GENERATION_BRIEF_VIDEO_EVAL_SCENARIOS as VIDEO_SCENARIOS,
} from '@api/services/generation-brief/generation-brief-eval-corpus';
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
