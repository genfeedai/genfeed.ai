import { describe, expect, it } from 'vitest';
import { ModelCategory, ModelLifecycle, ModelProvider, PricingType } from '..';
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

  it('carries HeyGen Voice as a Recommended voice row priced per 1,000 characters at the list price', () => {
    const voice = SELF_HOSTED_MODELS.find(
      (model) => model.key === MODEL_KEYS.HEYGEN_VOICE,
    );

    expect(voice).toMatchObject({
      category: ModelCategory.VOICE,
      isDefault: false,
      lifecycle: ModelLifecycle.RECOMMENDED,
      provider: ModelProvider.HEYGEN,
      // $30 per 1M characters is $0.03 per 1,000; 3.33x margin is 10 credits.
      providerCostUsd: 0.03,
    });
    expect(voice?.cost).toBe(10);
  });

  it.each([
    // $0.08 per 1,000 characters at 3.33x is 26.64, ceiled to 27 credits.
    [MODEL_KEYS.ELEVENLABS_V4, 0.08, 27, true],
    [MODEL_KEYS.ELEVENLABS_MULTILINGUAL_V2, 0.08, 27, false],
    // $0.04 per 1,000 characters at 3.33x is 13.32, ceiled to 14 credits.
    [MODEL_KEYS.ELEVENLABS_FLASH_V2_5, 0.04, 14, false],
  ])(
    'carries %s as a Recommended ElevenLabs voice row priced per 1,000 characters',
    (key, providerCostUsd, cost, isDefault) => {
      const voice = SELF_HOSTED_MODELS.find((model) => model.key === key);

      expect(voice).toMatchObject({
        category: ModelCategory.VOICE,
        cost,
        isDefault,
        lifecycle: ModelLifecycle.RECOMMENDED,
        provider: ModelProvider.ELEVENLABS,
        providerCostUsd,
      });
    },
  );
});
