import { ModelCategory, ModelKey } from '@genfeedai/enums';
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
    const enumValues = new Set(Object.values(ModelKey));
    for (const key of Object.keys(MODEL_OUTPUT_CAPABILITIES)) {
      expect(enumValues.has(key as ModelKey)).toBe(true);
    }
  });

  it('categories are valid ModelCategory values', () => {
    const validCategories = new Set(Object.values(ModelCategory));
    for (const cap of Object.values(MODEL_OUTPUT_CAPABILITIES)) {
      expect(validCategories.has(cap.category as ModelCategory)).toBe(true);
    }
  });
});
