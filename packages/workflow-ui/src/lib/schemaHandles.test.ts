import type { HandleDefinition } from '@genfeedai/types';
import { describe, expect, it } from 'vitest';

import { generateHandlesFromSchema, isSchemaHandle } from './schemaHandles';

describe('generateHandlesFromSchema', () => {
  const staticHandles: HandleDefinition[] = [
    { id: 'prompt', label: 'Prompt', type: 'text' },
    { id: 'image', label: 'Image', type: 'image' },
  ];

  it('returns staticHandles when no schema is provided', () => {
    const result = generateHandlesFromSchema(undefined, staticHandles);
    expect(result).toBe(staticHandles);
  });

  it('returns staticHandles when schema has no properties', () => {
    const schema = { required: ['prompt'] };
    const result = generateHandlesFromSchema(schema, staticHandles);
    expect(result).toBe(staticHandles);
  });

  it('returns staticHandles only when schema has no handle-able fields', () => {
    const schema = {
      properties: {
        height: { type: 'number' },
        width: { type: 'number' },
      },
    };
    const result = generateHandlesFromSchema(schema, staticHandles);
    expect(result).toEqual(staticHandles);
  });

  it('adds a dynamic image handle from schema', () => {
    const schema = {
      properties: {
        start_image: { title: 'Start Image', type: 'string' },
      },
    };
    const result = generateHandlesFromSchema(schema, staticHandles);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({
      fromSchema: true,
      id: 'start_image',
      label: 'Start Image',
      multiple: false,
      required: undefined,
      type: 'image',
    });
  });

  it('does not add duplicate when static handle already covers the field', () => {
    const schema = {
      properties: {
        prompt: { title: 'Prompt', type: 'string' },
        start_image: { title: 'Start Image', type: 'string' },
      },
    };
    const result = generateHandlesFromSchema(schema, staticHandles);
    // prompt already in static, only start_image is added
    expect(result).toHaveLength(3);
    expect(result.filter((h) => h.id === 'prompt')).toHaveLength(1);
  });

  it('sets multiple to true for array type fields', () => {
    const schema = {
      properties: {
        reference_images: { title: 'Reference Images', type: 'array' },
      },
    };
    const result = generateHandlesFromSchema(schema, staticHandles);
    const refHandle = result.find((h) => h.id === 'reference_images');
    expect(refHandle).toBeDefined();
    expect(refHandle?.multiple).toBe(true);
  });

  it('marks field as required when in schema.required array', () => {
    const schema = {
      properties: {
        start_image: { type: 'string' },
      },
      required: ['start_image'],
    };
    const result = generateHandlesFromSchema(schema, staticHandles);
    const handle = result.find((h) => h.id === 'start_image');
    expect(handle).toBeDefined();
    expect(handle?.required).toBe(true);
  });

  it('uses title from schema property as label when available', () => {
    const schema = {
      properties: {
        start_image: { title: 'Custom Title', type: 'string' },
      },
    };
    const result = generateHandlesFromSchema(schema, staticHandles);
    const handle = result.find((h) => h.id === 'start_image');
    expect(handle?.label).toBe('Custom Title');
  });

  it('falls back to formatted field name when title is missing', () => {
    const schema = {
      properties: {
        start_image: { type: 'string' },
      },
    };
    const result = generateHandlesFromSchema(schema, staticHandles);
    const handle = result.find((h) => h.id === 'start_image');
    expect(handle?.label).toBe('Start Image');
  });

  it('marks all dynamic handles with fromSchema: true', () => {
    const schema = {
      properties: {
        end_image: { type: 'string' },
        start_image: { type: 'string' },
        video_url: { type: 'string' },
      },
    };
    const result = generateHandlesFromSchema(schema, staticHandles);
    const dynamicHandles = result.filter((h) => !staticHandles.includes(h));
    expect(dynamicHandles).toHaveLength(3);
    for (const handle of dynamicHandles) {
      expect(handle.fromSchema).toBe(true);
    }
  });
});

describe('isSchemaHandle', () => {
  it('returns true when fromSchema is true', () => {
    const handle: HandleDefinition = {
      fromSchema: true,
      id: 'start_image',
      label: 'Start Image',
      type: 'image',
    };
    expect(isSchemaHandle(handle)).toBe(true);
  });

  it('returns false when fromSchema is false', () => {
    const handle: HandleDefinition = {
      fromSchema: false,
      id: 'prompt',
      label: 'Prompt',
      type: 'text',
    };
    expect(isSchemaHandle(handle)).toBe(false);
  });

  it('returns false when fromSchema is not set', () => {
    const handle: HandleDefinition = {
      id: 'prompt',
      label: 'Prompt',
      type: 'text',
    };
    expect(isSchemaHandle(handle)).toBe(false);
  });

  it('returns false when fromSchema is undefined', () => {
    const handle: HandleDefinition = {
      fromSchema: undefined,
      id: 'prompt',
      label: 'Prompt',
      type: 'text',
    };
    expect(isSchemaHandle(handle)).toBe(false);
  });
});
