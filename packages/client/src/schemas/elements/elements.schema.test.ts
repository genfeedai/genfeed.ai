import { createEditableInputSchema } from '@genfeedai/client/schemas/elements/editable-input.schema';
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
import { ModelCategory, ModelKey, ModelProvider } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('element schemas', () => {
  describe('elementBaseSchema', () => {
    it('accepts valid', () => {
      expect(
        elementBaseSchema.safeParse({ key: 'my-key', label: 'Label' }).success,
      ).toBe(true);
    });

    it('rejects empty key', () => {
      expect(elementBaseSchema.safeParse({ key: '', label: 'L' }).success).toBe(
        false,
      );
    });

    it('rejects uppercase key', () => {
      expect(
        elementBaseSchema.safeParse({ key: 'BadKey', label: 'L' }).success,
      ).toBe(false);
    });

    it('rejects empty label', () => {
      expect(elementBaseSchema.safeParse({ key: 'k', label: '' }).success).toBe(
        false,
      );
    });
  });

  describe('elementPresetSchema', () => {
    it('accepts valid preset', () => {
      expect(
        elementPresetSchema.safeParse({
          category: ModelCategory.IMAGE,
          isActive: true,
          key: 'p-1',
          label: 'P',
        }).success,
      ).toBe(true);
    });
  });

  describe('elementStyleSchema', () => {
    it('accepts valid style', () => {
      expect(
        elementStyleSchema.safeParse({ key: 's-1', label: 'S' }).success,
      ).toBe(true);
    });
  });

  describe('elementBlacklistSchema', () => {
    it('accepts valid', () => {
      expect(
        elementBlacklistSchema.safeParse({
          isActive: true,
          isDefault: false,
          key: 'b-1',
          label: 'B',
        }).success,
      ).toBe(true);
    });
  });

  describe('elementSoundSchema', () => {
    it('accepts valid', () => {
      expect(
        elementSoundSchema.safeParse({ key: 'snd-1', label: 'Sound' }).success,
      ).toBe(true);
    });
  });

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
      expect(getElementSchema('unknown' as any)).toBe(elementBaseSchema);
    });
  });

  describe('modelSchema', () => {
    it('accepts valid model', () => {
      expect(
        modelSchema.safeParse({
          category: ModelCategory.IMAGE,
          cost: 0,
          key: ModelKey.REPLICATE_GOOGLE_IMAGEN_3,
          label: 'Imagen 3',
          provider: ModelProvider.REPLICATE,
        }).success,
      ).toBe(true);
    });

    it('rejects negative cost', () => {
      expect(
        modelSchema.safeParse({
          category: ModelCategory.IMAGE,
          cost: -1,
          key: ModelKey.REPLICATE_GOOGLE_IMAGEN_3,
          label: 'L',
          provider: ModelProvider.REPLICATE,
        }).success,
      ).toBe(false);
    });

    it('rejects empty label', () => {
      expect(
        modelSchema.safeParse({
          category: ModelCategory.IMAGE,
          cost: 0,
          key: ModelKey.REPLICATE_GOOGLE_IMAGEN_3,
          label: '',
          provider: ModelProvider.REPLICATE,
        }).success,
      ).toBe(false);
    });
  });
});

describe('createEditableInputSchema', () => {
  it('basic text input', () => {
    const schema = createEditableInputSchema({ type: 'text' });
    expect(schema.safeParse({ editValue: 'hello' }).success).toBe(true);
  });

  it('enforces required', () => {
    const schema = createEditableInputSchema({ required: true });
    expect(schema.safeParse({ editValue: '' }).success).toBe(false);
    expect(schema.safeParse({ editValue: '  ' }).success).toBe(false);
    expect(schema.safeParse({ editValue: 'val' }).success).toBe(true);
  });

  it('enforces minLength', () => {
    const schema = createEditableInputSchema({ minLength: 3 });
    expect(schema.safeParse({ editValue: 'ab' }).success).toBe(false);
    expect(schema.safeParse({ editValue: 'abc' }).success).toBe(true);
  });

  it('enforces maxLength', () => {
    const schema = createEditableInputSchema({ maxLength: 5 });
    expect(schema.safeParse({ editValue: 'abcdef' }).success).toBe(false);
    expect(schema.safeParse({ editValue: 'abcde' }).success).toBe(true);
  });

  it('validates email', () => {
    const schema = createEditableInputSchema({ type: 'email' });
    expect(schema.safeParse({ editValue: 'a@b.com' }).success).toBe(true);
    expect(schema.safeParse({ editValue: 'bad' }).success).toBe(false);
    expect(schema.safeParse({ editValue: '' }).success).toBe(true);
  });

  it('validates url', () => {
    const schema = createEditableInputSchema({ type: 'url' });
    expect(schema.safeParse({ editValue: 'https://x.com' }).success).toBe(true);
    expect(schema.safeParse({ editValue: 'bad' }).success).toBe(false);
    expect(schema.safeParse({ editValue: '' }).success).toBe(true);
  });

  it('applies customValidation', () => {
    const schema = createEditableInputSchema({
      customValidation: (val) => (val === 'bad' ? 'Nope' : null),
    });
    expect(schema.safeParse({ editValue: 'good' }).success).toBe(true);
    expect(schema.safeParse({ editValue: 'bad' }).success).toBe(false);
  });
});
