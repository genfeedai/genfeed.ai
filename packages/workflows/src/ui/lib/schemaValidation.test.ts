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
});

describe('CONNECTION_FIELDS', () => {
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
