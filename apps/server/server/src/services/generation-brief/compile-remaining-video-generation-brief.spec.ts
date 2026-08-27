import { videoGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { compileRemainingVideoGenerationBrief } from '@server/services/generation-brief/compile-remaining-video-generation-brief';
import { GenerationBriefCompileError } from '@server/services/generation-brief/generation-brief-compile.error';
import { REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES } from '@server/services/generation-brief/remaining-video-generation-brief-families';
import { describe, expect, it } from 'vitest';

function familyFor(modelKey: string) {
  const family = REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES.find((entry) =>
    entry.profiles.some((profile) => profile.modelKey === modelKey),
  );
  if (!family) {
    throw new Error(`No remaining video family for ${modelKey}`);
  }
  return family;
}

describe('compileRemainingVideoGenerationBrief', () => {
  it('compiles Veo 3 Fast with duration and aspect ratio', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'waves hitting a cliff at dusk' },
      mediaKind: 'video',
      output: { aspectRatio: '16:9', durationSeconds: 8 },
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST),
      modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    });

    expect(result.dispatch.prompt).toBe('waves hitting a cliff at dusk');
    expect(result.dispatch.aspect_ratio).toBe('16:9');
    expect(result.dispatch.duration).toBe(8);
  });

  it('preserves creative direction in the provider prompt and evidence', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: {
        cinematography: 'handheld',
        composition: 'dolly, wide',
        lighting: 'natural',
        motion: 'slow',
        objective: 'the product turns to camera',
        scene: 'a daylight studio',
        visualDirection: 'editorial',
      },
      mediaKind: 'video',
      output: { aspectRatio: '16:9', durationSeconds: 8 },
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST),
      modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    });

    expect(result.dispatch.prompt).toBe(
      'the product turns to camera, a daylight studio, dolly, wide, natural, handheld, slow, editorial',
    );
    expect(result.evidence.appliedFields).toEqual(
      expect.arrayContaining([
        'intent.cinematography',
        'intent.composition',
        'intent.lighting',
        'intent.motion',
        'intent.scene',
        'intent.visualDirection',
      ]),
    );
  });

  it('requires a first frame for Kling v2.1', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'the product turns to camera' },
      mediaKind: 'video',
      output: { durationSeconds: 5 },
      version: 1,
    });

    expect(() =>
      compileRemainingVideoGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1),
        modelKey: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('maps first_frame onto start_image for Kling', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'the product turns to camera' },
      mediaKind: 'video',
      output: { aspectRatio: '9:16', durationSeconds: 5 },
      references: [{ assetId: 'frame-1', role: 'first_frame' }],
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1),
      modelKey: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
    });

    expect(result.dispatch.start_image).toBe('frame-1');
  });
});
