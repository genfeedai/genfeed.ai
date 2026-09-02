import { compileRemainingVideoGenerationBrief } from '@api/services/generation-brief/compile-remaining-video-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-video-generation-brief-families';
import { videoGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
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
      'the product turns to camera. a daylight studio. dolly, wide. natural. handheld. slow. editorial',
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

  it('omits seeds for Sora profiles that do not expose a seed field', () => {
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
      family: familyFor(MODEL_KEYS.REPLICATE_OPENAI_SORA_2),
      modelKey: MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
      seed: 42,
    });

    expect(result.dispatch).not.toHaveProperty('seed');
  });

  it('rejects a last frame when the selected profile exposes only a start image', () => {
    const modelKey = MODEL_KEYS.FAL_KLING_VIDEO_V3_PRO;
    const family = familyFor(modelKey);
    const profile = family.profiles.find(
      (candidate) => candidate.modelKey === modelKey,
    );
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'strict',
      intent: { objective: 'the product turns to camera' },
      mediaKind: 'video',
      output: { aspectRatio: '9:16', durationSeconds: 5 },
      references: [{ assetId: 'last-frame-1', role: 'last_frame' }],
      version: 1,
    });

    expect(profile?.references.roles).toEqual(['subject', 'first_frame']);
    expect(() =>
      compileRemainingVideoGenerationBrief({ brief, family, modelKey }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('dispatches Seedance 2.5 published draft resolution explicitly', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a premium product reveal' },
      mediaKind: 'video',
      output: { resolution: '480p' },
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5),
      modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    });

    expect(result.dispatch.resolution).toBe('480p');
    expect(result.evidence.output.resolution).toBe('480p');
  });

  it('rejects a Seedance last frame without its required first frame', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'arrive at the final composition' },
      mediaKind: 'video',
      output: {},
      references: [{ assetId: 'end-frame-1', role: 'last_frame' }],
      version: 1,
    });

    expect(() =>
      compileRemainingVideoGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5),
        modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      }),
    ).toThrow('requires a first-frame reference');
  });

  it('maps Kling v3 native quality onto mode', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a cinematic launch sequence' },
      mediaKind: 'video',
      output: { resolution: '4k' },
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO),
      modelKey: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
    });

    expect(result.dispatch.mode).toBe('4k');
  });

  it('rejects a resolution the selected model does not advertise', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a cinematic launch sequence' },
      mediaKind: 'video',
      output: { resolution: '360p' },
      version: 1,
    });

    expect(() =>
      compileRemainingVideoGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST),
        modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('dispatches Seedance native video references', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Follow the movement language of the clip' },
      mediaKind: 'video',
      output: { resolution: '720p' },
      references: [{ assetId: 'video-1', role: 'reference_video' }],
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5),
      modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    });

    expect(result.dispatch.reference_videos).toEqual(['video-1']);
  });

  it('dispatches Seedance 2.5 last-frame interpolation through the documented field', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Move between the supplied keyframes' },
      mediaKind: 'video',
      output: { resolution: '720p' },
      references: [
        { assetId: 'start-frame', role: 'first_frame' },
        { assetId: 'end-frame', role: 'last_frame' },
      ],
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5),
      modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    });

    expect(result.dispatch).toMatchObject({
      aspect_ratio: 'adaptive',
      image: 'start-frame',
      last_frame_image: 'end-frame',
    });
  });

  it('rejects Seedance frames combined with a video reference', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Follow the supplied source' },
      mediaKind: 'video',
      output: { resolution: '720p' },
      references: [
        { assetId: 'start-frame', role: 'first_frame' },
        { assetId: 'source-video', role: 'reference_video' },
      ],
      version: 1,
    });

    expect(() =>
      compileRemainingVideoGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5),
        modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      }),
    ).toThrow('cannot combine');
  });

  it('rejects Kling Omni video references in incompatible 4K mode', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Follow the movement language of the clip' },
      mediaKind: 'video',
      output: { resolution: '4k' },
      references: [{ assetId: 'video-1', role: 'reference_video' }],
      version: 1,
    });

    expect(() =>
      compileRemainingVideoGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO),
        modelKey: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('dispatches Kling Omni video references outside 4K mode', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Follow the movement language of the clip' },
      mediaKind: 'video',
      output: { resolution: 'pro' },
      references: [{ assetId: 'video-1', role: 'reference_video' }],
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO),
      modelKey: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
    });

    expect(result.dispatch.reference_video).toBe('video-1');
  });

  it('rejects more than one Kling Omni video reference', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Follow both movement clips' },
      mediaKind: 'video',
      output: { resolution: 'pro' },
      references: [
        { assetId: 'video-1', role: 'reference_video' },
        { assetId: 'video-2', role: 'reference_video' },
      ],
      version: 1,
    });

    expect(() =>
      compileRemainingVideoGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO),
        modelKey: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
      }),
    ).toThrow('at most 1 video reference');
  });

  it('applies Kling Omni reduced image-reference cap when video is present', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Follow the character and movement references' },
      mediaKind: 'video',
      output: { resolution: 'pro' },
      references: [
        { assetId: 'start-frame', role: 'first_frame' },
        ...Array.from({ length: 5 }, (_, index) => ({
          assetId: `image-reference-${index + 1}`,
          role: 'subject' as const,
        })),
        { assetId: 'video-reference', role: 'reference_video' },
      ],
      version: 1,
    });

    expect(() =>
      compileRemainingVideoGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO),
        modelKey: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
      }),
    ).toThrow('at most 4 image references');
  });

  it('compiles only fal-published Gemini Omni Flash fields', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'a drummer performing under neon lights' },
      mediaKind: 'video',
      output: { aspectRatio: '9:16', durationSeconds: 2 },
      references: [
        { assetId: 'frame-1', role: 'first_frame' },
        { assetId: 'subject-1', role: 'subject' },
        { assetId: 'style-1', role: 'style' },
      ],
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH),
      modelKey: MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH,
      seed: 42,
    });

    expect(result.dispatch).toEqual({
      aspect_ratio: '9:16',
      duration: 3,
      image_url: 'frame-1',
      image_urls: ['subject-1', 'style-1'],
      prompt: 'a drummer performing under neon lights',
    });
    expect(result.evidence.output).toMatchObject({
      aspectRatio: '9:16',
      durationSeconds: 3,
      hasSeed: false,
    });
  });

  it('rejects resolution for Gemini Omni Flash because fal publishes none', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a cinematic city flyover' },
      mediaKind: 'video',
      output: { resolution: '720p' },
      version: 1,
    });

    expect(() =>
      compileRemainingVideoGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH),
        modelKey: MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH,
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('rejects more image references than Gemini Omni Flash publishes', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'a cinematic city flyover' },
      mediaKind: 'video',
      output: {},
      references: [
        { assetId: 'frame-1', role: 'first_frame' },
        { assetId: 'subject-1', role: 'subject' },
        { assetId: 'style-1', role: 'style' },
        { assetId: 'composition-1', role: 'composition' },
      ],
      version: 1,
    });

    expect(() =>
      compileRemainingVideoGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH),
        modelKey: MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH,
      }),
    ).toThrow('at most 3 image references');
  });

  it('compiles MiniMax H3 Max first/last frames and provider defaults', () => {
    const brief = videoGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'an airship crossing a desert at sunset' },
      mediaKind: 'video',
      output: {
        aspectRatio: '21:9',
        durationSeconds: 15,
        resolution: '768P',
      },
      references: [
        { assetId: 'start-frame', role: 'first_frame' },
        { assetId: 'end-frame', role: 'last_frame' },
      ],
      version: 1,
    });

    const result = compileRemainingVideoGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.FAL_MINIMAX_H3_MAX),
      modelKey: MODEL_KEYS.FAL_MINIMAX_H3_MAX,
      seed: 42,
    });

    expect(result.dispatch).toEqual({
      aspect_ratio: '21:9',
      duration: 15,
      enable_safety_checker: true,
      end_image_url: 'end-frame',
      image_url: 'start-frame',
      prompt: 'an airship crossing a desert at sunset',
      prompt_expansion_mode: 'balanced',
      resolution: '768P',
      seed: 42,
    });
  });
});
