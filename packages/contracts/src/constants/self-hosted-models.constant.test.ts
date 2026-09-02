import { describe, expect, it } from 'vitest';
import { type ModelCategory, PricingType } from '..';
import { MODEL_KEYS } from './model-keys.constant';
import { SELF_HOSTED_MODELS } from './self-hosted-models.constant';

const modelKeyValues = new Set(Object.values(MODEL_KEYS));

describe('SELF_HOSTED_MODELS', () => {
  it('uses unique registry keys that exist on MODEL_KEYS', () => {
    const keys = SELF_HOSTED_MODELS.map((model) => model.key);

    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => modelKeyValues.has(key))).toBe(true);
  });

  it('marks at most one default per category and always stores provider USD', () => {
    const defaultsByCategory = new Map<ModelCategory, number>();

    for (const model of SELF_HOSTED_MODELS) {
      expect(model.providerCostUsd).toBeGreaterThan(0);
      expect(model.cost).toBeGreaterThan(0);

      if (model.pricingType === PricingType.PER_SECOND) {
        expect(model.costPerUnit).toBeGreaterThan(0);
      }

      if (model.isDefault) {
        defaultsByCategory.set(
          model.category,
          (defaultsByCategory.get(model.category) ?? 0) + 1,
        );
      }
    }

    for (const count of defaultsByCategory.values()) {
      expect(count).toBe(1);
    }
  });
});
