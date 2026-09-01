import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { MODEL_OUTPUT_CAPABILITIES } from './model-capabilities.constant';

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
