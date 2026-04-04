import { describe, expect, it } from 'vitest';

import {
  extractEnumValues,
  getSchemaDefaults,
  supportsImageInput,
} from './schemaUtils';

describe('getSchemaDefaults', () => {
  it('returns empty object when schema is undefined', () => {
    expect(getSchemaDefaults(undefined)).toEqual({});
  });

  it('returns empty object when schema has no properties', () => {
    expect(getSchemaDefaults({})).toEqual({});
  });

  it('extracts default values from properties', () => {
    const schema = {
      properties: {
        height: { default: 768, type: 'integer' },
        width: { default: 1024, type: 'integer' },
      },
    };
    expect(getSchemaDefaults(schema)).toEqual({ height: 768, width: 1024 });
  });

  it('skips properties without defaults', () => {
    const schema = {
      properties: {
        prompt: { type: 'string' },
        steps: { type: 'integer' },
      },
    };
    expect(getSchemaDefaults(schema)).toEqual({});
  });

  it('extracts only properties that have defaults in mixed schema', () => {
    const schema = {
      properties: {
        guidance_scale: { default: 7.5, type: 'number' },
        negative_prompt: { type: 'string' },
        prompt: { type: 'string' },
        width: { default: 1024, type: 'integer' },
      },
    };
    expect(getSchemaDefaults(schema)).toEqual({
      guidance_scale: 7.5,
      width: 1024,
    });
  });

  it('includes default value of 0', () => {
    const schema = {
      properties: {
        seed: { default: 0, type: 'integer' },
      },
    };
    expect(getSchemaDefaults(schema)).toEqual({ seed: 0 });
  });

  it('includes default value of empty string', () => {
    const schema = {
      properties: {
        negative_prompt: { default: '', type: 'string' },
      },
    };
    expect(getSchemaDefaults(schema)).toEqual({ negative_prompt: '' });
  });

  it('includes default value of false', () => {
    const schema = {
      properties: {
        disable_safety: { default: false, type: 'boolean' },
      },
    };
    expect(getSchemaDefaults(schema)).toEqual({ disable_safety: false });
  });
});

describe('supportsImageInput', () => {
  it('returns true when schema is undefined', () => {
    expect(supportsImageInput(undefined)).toBe(true);
  });

  it('returns true when schema has no properties', () => {
    expect(supportsImageInput({})).toBe(true);
  });

  it('returns true when schema has image property', () => {
    const schema = { properties: { image: { type: 'string' } } };
    expect(supportsImageInput(schema)).toBe(true);
  });

  it('returns true when schema has image_input property', () => {
    const schema = { properties: { image_input: { type: 'string' } } };
    expect(supportsImageInput(schema)).toBe(true);
  });

  it('returns true when schema has start_image property', () => {
    const schema = { properties: { start_image: { type: 'string' } } };
    expect(supportsImageInput(schema)).toBe(true);
  });

  it('returns true when schema has first_frame_image property', () => {
    const schema = { properties: { first_frame_image: { type: 'string' } } };
    expect(supportsImageInput(schema)).toBe(true);
  });

  it('returns true when schema has reference_images property', () => {
    const schema = { properties: { reference_images: { type: 'array' } } };
    expect(supportsImageInput(schema)).toBe(true);
  });

  it('returns true when schema has image_url property', () => {
    const schema = { properties: { image_url: { type: 'string', format: 'uri' } } };
    expect(supportsImageInput(schema)).toBe(true);
  });

  it('returns true when schema has image_urls property (fal.ai nano-banana-2/edit)', () => {
    const schema = {
      properties: {
        image_urls: { type: 'array', items: { type: 'string', format: 'uri' } },
        prompt: { type: 'string' },
      },
    };
    expect(supportsImageInput(schema)).toBe(true);
  });

  it('returns false when schema has no image fields', () => {
    const schema = {
      properties: {
        model: { type: 'string' },
        prompt: { type: 'string' },
      },
    };
    expect(supportsImageInput(schema)).toBe(false);
  });

  it('returns false when schema has only unrelated properties', () => {
    const schema = {
      properties: {
        height: { type: 'integer' },
        steps: { type: 'integer' },
        width: { type: 'integer' },
      },
    };
    expect(supportsImageInput(schema)).toBe(false);
  });
});

describe('extractEnumValues', () => {
  it('returns undefined for undefined input', () => {
    expect(extractEnumValues(undefined)).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(extractEnumValues({})).toBeUndefined();
  });

  it('converts enum arrays to string arrays', () => {
    const schemas = {
      scheduler: { enum: ['euler', 'ddim', 'dpm'], type: 'string' },
    };
    expect(extractEnumValues(schemas)).toEqual({
      scheduler: ['euler', 'ddim', 'dpm'],
    });
  });

  it('converts numeric enums to strings', () => {
    const schemas = {
      steps: { enum: [10, 20, 30, 50], type: 'integer' },
    };
    expect(extractEnumValues(schemas)).toEqual({
      steps: ['10', '20', '30', '50'],
    });
  });

  it('converts mixed types in enum to strings', () => {
    const schemas = {
      value: { enum: ['auto', 1, true, null], type: 'string' },
    };
    expect(extractEnumValues(schemas)).toEqual({
      value: ['auto', '1', 'true', 'null'],
    });
  });

  it('skips schema entries without enum', () => {
    const schemas = {
      prompt: { type: 'string' },
    };
    expect(extractEnumValues(schemas)).toBeUndefined();
  });

  it('returns only entries that have enums in mixed input', () => {
    const schemas = {
      prompt: { type: 'string' },
      sampler: { enum: ['k_euler', 'k_lms'], type: 'string' },
      scheduler: { enum: ['euler', 'ddim'], type: 'string' },
    };
    const result = extractEnumValues(schemas);
    expect(result).toEqual({
      sampler: ['k_euler', 'k_lms'],
      scheduler: ['euler', 'ddim'],
    });
    expect(result).not.toHaveProperty('prompt');
  });
});
