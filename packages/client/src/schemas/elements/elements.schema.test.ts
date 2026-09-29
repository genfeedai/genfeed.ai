import {
  elementBaseSchema,
  elementBlacklistSchema,
  elementPresetSchema,
  elementSimpleSchema,
  elementSoundSchema,
  elementStyleSchema,
  getElementSchema,
} from '@genfeedai/client/schemas/elements/element.schema';
import { modelSchema } from '@genfeedai/client/schemas/elements/model.schema';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('element schemas', () => {
  describe('getElementSchema', () => {
    it('returns correct schema for each type', () => {
      expect(getElementSchema('preset')).toBe(elementPresetSchema);
      expect(getElementSchema('style')).toBe(elementStyleSchema);
      expect(getElementSchema('blacklist')).toBe(elementBlacklistSchema);
      expect(getElementSchema('sound')).toBe(elementSoundSchema);
      expect(getElementSchema('mood')).toBe(elementSimpleSchema);
      expect(getElementSchema('camera')).toBe(elementSimpleSchema);
      expect(getElementSchema('font-family')).toBe(elementSimpleSchema);
      expect(getElementSchema('lens')).toBe(elementSimpleSchema);
      expect(getElementSchema('lighting')).toBe(elementSimpleSchema);
      expect(getElementSchema('camera-movement')).toBe(elementSimpleSchema);
    });

    it('returns base schema for unknown type', () => {
      expect(
        getElementSchema('unknown' as Parameters<typeof getElementSchema>[0]),
      ).toBe(elementBaseSchema);
    });
  });

  describe('modelSchema', () => {
    it('rejects empty label', () => {
      expect(
        modelSchema.safeParse({
          category: ModelCategory.IMAGE,
          cost: 0,
          key: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
          label: '',
          provider: ModelProvider.REPLICATE,
        }).success,
      ).toBe(false);
    });
  });
});
