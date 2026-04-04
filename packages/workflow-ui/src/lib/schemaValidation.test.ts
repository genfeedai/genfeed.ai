import { describe, expect, it } from 'vitest';

import {
  CONNECTION_FIELDS,
  validateRequiredSchemaFields,
} from './schemaValidation';

describe('validateRequiredSchemaFields', () => {
  it('returns valid when no schema is provided', () => {
    const result = validateRequiredSchemaFields(undefined, {}, new Set());
    expect(result).toEqual({ isValid: true, missingFields: [] });
  });

  it('returns valid when schema has no required fields', () => {
    const schema = { properties: { name: { type: 'string' } } };
    const result = validateRequiredSchemaFields(schema, {}, new Set());
    expect(result).toEqual({ isValid: true, missingFields: [] });
  });

  it('returns valid when schema has empty required array', () => {
    const schema = { properties: { name: { type: 'string' } }, required: [] };
    const result = validateRequiredSchemaFields(schema, {}, new Set());
    expect(result).toEqual({ isValid: true, missingFields: [] });
  });

  it('returns valid when all required fields have values', () => {
    const schema = {
      properties: { height: { type: 'number' }, width: { type: 'number' } },
      required: ['width', 'height'],
    };
    const result = validateRequiredSchemaFields(
      schema,
      { height: 512, width: 512 },
      new Set(),
    );
    expect(result).toEqual({ isValid: true, missingFields: [] });
  });

  it('reports a single missing required field', () => {
    const schema = {
      properties: { height: { type: 'number' }, width: { type: 'number' } },
      required: ['width', 'height'],
    };
    const result = validateRequiredSchemaFields(
      schema,
      { width: 512 },
      new Set(),
    );
    expect(result).toEqual({ isValid: false, missingFields: ['height'] });
  });

  it('reports multiple missing required fields', () => {
    const schema = {
      properties: {
        height: { type: 'number' },
        steps: { type: 'number' },
        width: { type: 'number' },
      },
      required: ['width', 'height', 'steps'],
    };
    const result = validateRequiredSchemaFields(schema, {}, new Set());
    expect(result).toEqual({
      isValid: false,
      missingFields: ['width', 'height', 'steps'],
    });
  });

  it('skips fields present in the skipFields set', () => {
    const schema = {
      properties: { prompt: { type: 'string' }, width: { type: 'number' } },
      required: ['prompt', 'width'],
    };
    const result = validateRequiredSchemaFields(
      schema,
      { width: 512 },
      new Set(['prompt']),
    );
    expect(result).toEqual({ isValid: true, missingFields: [] });
  });

  it('treats empty string as missing', () => {
    const schema = {
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const result = validateRequiredSchemaFields(
      schema,
      { name: '' },
      new Set(),
    );
    expect(result).toEqual({ isValid: false, missingFields: ['name'] });
  });

  it('treats null as missing', () => {
    const schema = {
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const result = validateRequiredSchemaFields(
      schema,
      { name: null },
      new Set(),
    );
    expect(result).toEqual({ isValid: false, missingFields: ['name'] });
  });

  it('treats undefined as missing', () => {
    const schema = {
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const result = validateRequiredSchemaFields(
      schema,
      { name: undefined },
      new Set(),
    );
    expect(result).toEqual({ isValid: false, missingFields: ['name'] });
  });

  it('does not treat 0 as missing', () => {
    const schema = {
      properties: { steps: { type: 'number' } },
      required: ['steps'],
    };
    const result = validateRequiredSchemaFields(
      schema,
      { steps: 0 },
      new Set(),
    );
    expect(result).toEqual({ isValid: true, missingFields: [] });
  });

  it('does not treat false as missing', () => {
    const schema = {
      properties: { enabled: { type: 'boolean' } },
      required: ['enabled'],
    };
    const result = validateRequiredSchemaFields(
      schema,
      { enabled: false },
      new Set(),
    );
    expect(result).toEqual({ isValid: true, missingFields: [] });
  });
});

describe('CONNECTION_FIELDS', () => {
  it('is a Set instance', () => {
    expect(CONNECTION_FIELDS).toBeInstanceOf(Set);
  });

  it('has exactly 18 entries', () => {
    expect(CONNECTION_FIELDS.size).toBe(18);
  });

  it('contains all expected connection field names', () => {
    const expected = [
      'prompt',
      'image',
      'image_input',
      'image_url',
      'image_urls',
      'video',
      'audio',
      'start_image',
      'first_frame_image',
      'last_frame',
      'reference_images',
      'video_url',
      'end_image',
      'start_video_id',
      'end_video_id',
      'subject_reference',
      'image_prompt',
      'mask',
    ];
    for (const field of expected) {
      expect(CONNECTION_FIELDS.has(field)).toBe(true);
    }
  });
});
