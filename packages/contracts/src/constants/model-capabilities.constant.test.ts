import { describe, expect, it } from 'vitest';
import { ModelCategory } from '..';
import { MODEL_KEYS } from '.';
import {
  MODEL_OUTPUT_CAPABILITIES,
  normalizeMusicSettings,
  resolveMusicSettings,
} from './model-capabilities.constant';

describe('model-capabilities.constant', () => {
  it('exports MODEL_OUTPUT_CAPABILITIES object', () => {
    expect(MODEL_OUTPUT_CAPABILITIES).toBeDefined();
    expect(typeof MODEL_OUTPUT_CAPABILITIES).toBe('object');
  });

  it('all capabilities have required base fields', () => {
    for (const [, cap] of Object.entries(MODEL_OUTPUT_CAPABILITIES)) {
      expect(cap.category).toBeDefined();
      expect(typeof cap.maxOutputs).toBe('number');
      expect(typeof cap.isBatchSupported).toBe('boolean');
      expect(typeof cap.maxReferences).toBe('number');
    }
  });

  it('model keys are valid ModelKey values', () => {
    const enumValues = new Set(Object.values(MODEL_KEYS));
    for (const key of Object.keys(MODEL_OUTPUT_CAPABILITIES)) {
      expect(enumValues.has(key as string)).toBe(true);
    }
  });

  it('categories are valid ModelCategory values', () => {
    const validCategories = new Set(Object.values(ModelCategory));
    for (const cap of Object.values(MODEL_OUTPUT_CAPABILITIES)) {
      expect(validCategories.has(cap.category as ModelCategory)).toBe(true);
    }
  });

  it('routes BGE as the text embedding capability', () => {
    expect(
      MODEL_OUTPUT_CAPABILITIES[MODEL_KEYS.REPLICATE_NATERAW_BGE_LARGE_EN_V1_5],
    ).toMatchObject({
      category: ModelCategory.EMBEDDING,
      maxReferences: 0,
    });
    expect(
      MODEL_OUTPUT_CAPABILITIES[MODEL_KEYS.REPLICATE_OPENAI_CLIP],
    ).toBeUndefined();
  });

  it('advertises only fal-published Gemini Omni Flash controls', () => {
    const capability =
      MODEL_OUTPUT_CAPABILITIES[MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH];

    expect(capability).toMatchObject({
      aspectRatios: ['16:9', '9:16'],
      category: ModelCategory.VIDEO,
      defaultDuration: 8,
      durations: [3, 4, 5, 6, 7, 8, 9, 10],
      hasDurationEditing: true,
      hasSpeech: true,
      maxReferences: 3,
    });
    expect(capability).not.toHaveProperty('hasEndFrame');
    expect(capability).not.toHaveProperty('hasResolutionOptions');
    expect(capability).not.toHaveProperty('hasVideoReferences');
  });

  it('advertises the fal-published MiniMax H3 Max controls', () => {
    expect(
      MODEL_OUTPUT_CAPABILITIES[MODEL_KEYS.FAL_MINIMAX_H3_MAX],
    ).toMatchObject({
      aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      category: ModelCategory.VIDEO,
      defaultDuration: 5,
      durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      maxReferences: 1,
    });
  });
});

describe('music settings contract', () => {
  it.each([
    undefined,
    '',
    'auto',
    'unknown',
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
  ])('fails closed for %s', (key) => {
    expect(
      normalizeMusicSettings(key, {
        duration: 90,
        instrumental: true,
        lyrics: 'stale',
      }),
    ).toEqual({
      duration: undefined,
      instrumental: undefined,
      lyrics: undefined,
    });
    expect(resolveMusicSettings(key)).toMatchObject({
      durations: [],
      hasDurationEditing: false,
      hasInstrumentalToggle: false,
      hasLyrics: false,
    });
  });

  it('requires explicit capability flags', () => {
    const key = 'test-music-with-missing-flags';
    MODEL_OUTPUT_CAPABILITIES[key] = {
      category: ModelCategory.MUSIC,
      durations: [10],
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    };
    try {
      expect(
        normalizeMusicSettings(key, {
          duration: 10,
          instrumental: true,
          lyrics: 'stale',
        }),
      ).toEqual({
        duration: undefined,
        instrumental: undefined,
        lyrics: undefined,
      });
    } finally {
      delete MODEL_OUTPUT_CAPABILITIES[key];
    }
  });

  it.each([
    [90, 30],
    [1, 5],
    [12.5, 10],
    [Number.NaN, 10],
    [Infinity, 10],
    [undefined, 10],
  ])('normalizes MusicGen duration %s to %s', (duration, expected) => {
    expect(
      normalizeMusicSettings(MODEL_KEYS.REPLICATE_META_MUSICGEN, {
        duration,
        instrumental: false,
        lyrics: 'stale',
      }),
    ).toEqual({ duration: expected, instrumental: true, lyrics: undefined });
  });

  it('uses Eleven Music defaults and clears instrumental lyrics', () => {
    expect(
      normalizeMusicSettings(MODEL_KEYS.FAL_ELEVENLABS_MUSIC, {
        lyrics: '  verse  ',
      }),
    ).toEqual({ duration: 30, instrumental: false, lyrics: 'verse' });
    expect(
      normalizeMusicSettings(MODEL_KEYS.FAL_ELEVENLABS_MUSIC, {
        duration: 17,
        instrumental: true,
        lyrics: 'verse',
      }),
    ).toEqual({ duration: 15, instrumental: true, lyrics: undefined });
  });

  it.each([MODEL_KEYS.FAL_LYRIA3_PRO, MODEL_KEYS.MUREKA_V9])(
    'omits unsupported duration for %s while retaining vocals',
    (key) => {
      expect(resolveMusicSettings(key)).toMatchObject({
        durations: [],
        hasDurationEditing: false,
        hasInstrumentalToggle: true,
        hasLyrics: true,
      });
      expect(
        normalizeMusicSettings(key, { duration: 90, lyrics: 'verse' }),
      ).toEqual({ duration: undefined, instrumental: false, lyrics: 'verse' });
    },
  );
});
