import { describe, expect, it } from 'vitest';
import {
  findInapplicableMediaTransformParameters,
  getMediaTransformOperation,
  isMediaTransformOperation,
  MEDIA_TRANSFORM_OPERATION_PARAMETERS,
  MEDIA_TRANSFORM_OPERATIONS,
  MEDIA_TRANSFORM_RESULT_KINDS,
  MEDIA_TRANSFORM_TOOL_NAME,
} from './media-transform';
import { getToolByName } from './tool-registry';

describe('media transform operation parsing', () => {
  it('names the single transform_media tool and its four operations', () => {
    expect(MEDIA_TRANSFORM_TOOL_NAME).toBe('transform_media');
    expect([...MEDIA_TRANSFORM_OPERATIONS]).toEqual([
      'edit',
      'reframe',
      'upscale',
      'merge',
    ]);
  });

  it.each(MEDIA_TRANSFORM_OPERATIONS)(
    'reads operation %s from a transform_media call',
    (operation) => {
      expect(getMediaTransformOperation('transform_media', { operation })).toBe(
        operation,
      );
      expect(isMediaTransformOperation(operation)).toBe(true);
    },
  );

  it.each([
    ['another tool', 'generate', { operation: 'edit' }],
    ['a removed per-operation tool', 'edit_image', { operation: 'edit' }],
    ['an unknown operation', 'transform_media', { operation: 'crop' }],
    ['a missing operation', 'transform_media', {}],
    ['a non-string operation', 'transform_media', { operation: 1 }],
    ['null parameters', 'transform_media', null],
    ['undefined parameters', 'transform_media', undefined],
  ])('returns undefined for %s', (_label, name, parameters) => {
    expect(getMediaTransformOperation(name, parameters)).toBeUndefined();
  });

  it('maps image operations to image cards and merge to video', () => {
    expect(MEDIA_TRANSFORM_RESULT_KINDS).toEqual({
      edit: 'image',
      merge: 'video',
      reframe: 'image',
      upscale: 'image',
    });
  });
});

describe('inapplicable media transform parameters', () => {
  it('flags merge fields on an edit call', () => {
    expect(
      findInapplicableMediaTransformParameters('edit', {
        ids: ['a', 'b'],
        imageId: 'img-1',
        operation: 'edit',
        prompt: 'make it blue',
        transition: 'fade',
      }),
    ).toEqual(['ids', 'transition']);
  });

  it('flags an edit prompt on a reframe call', () => {
    expect(
      findInapplicableMediaTransformParameters('reframe', {
        aspectRatio: '16:9',
        imageId: 'img-1',
        operation: 'reframe',
        prompt: 'make it blue',
      }),
    ).toEqual(['prompt']);
  });

  it('flags imageId on an upscale call, which takes imageUrl', () => {
    expect(
      findInapplicableMediaTransformParameters('upscale', {
        imageId: 'img-1',
        imageUrl: 'https://cdn.example.com/a.png',
        operation: 'upscale',
      }),
    ).toEqual(['imageId']);
  });

  it('treats zoom fields as inapplicable to merge', () => {
    expect(
      findInapplicableMediaTransformParameters('merge', {
        ids: ['a', 'b'],
        operation: 'merge',
        zoomConfigs: [],
        zoomEaseCurve: 'easyinoutexpo',
      }),
    ).toEqual(['zoomConfigs', 'zoomEaseCurve']);
  });

  it('ignores undefined and null values', () => {
    expect(
      findInapplicableMediaTransformParameters('merge', {
        ids: ['a', 'b'],
        imageId: null,
        operation: 'merge',
        prompt: undefined,
      }),
    ).toEqual([]);
  });

  it('accepts every documented field for its own operation', () => {
    for (const operation of MEDIA_TRANSFORM_OPERATIONS) {
      const parameters = Object.fromEntries(
        [...MEDIA_TRANSFORM_OPERATION_PARAMETERS[operation]].map((key) => [
          key,
          'x',
        ]),
      );
      expect(
        findInapplicableMediaTransformParameters(operation, parameters),
      ).toEqual([]);
    }
  });
});

describe('transform_media tool definition', () => {
  const tool = getToolByName('transform_media');

  it('is one agent and MCP generation tool with a flat schema', () => {
    expect(tool?.surfaces).toMatchObject({ agent: true, mcp: true });
    expect(tool?.toolset).toBe('generation');
    expect(tool?.mutationPolicy).toBe('direct');
    expect(tool?.parameters.required).toEqual(['operation']);
    expect(tool?.parameters).not.toHaveProperty('oneOf');
    expect(tool?.parameters.properties.operation).toMatchObject({
      enum: ['edit', 'reframe', 'upscale', 'merge'],
    });
  });

  it('is open-world and not read-only', () => {
    expect(tool?.annotations).toMatchObject({
      openWorldHint: true,
      readOnlyHint: false,
    });
  });

  it('does not declare the unsupported merge zoom fields', () => {
    expect(tool?.parameters.properties).not.toHaveProperty('zoomEaseCurve');
    expect(tool?.parameters.properties).not.toHaveProperty('zoomConfigs');
  });

  it('prefixes every operation-specific field with the operations it applies to', () => {
    const shared = new Set(['operation', 'brandId']);
    for (const [key, schema] of Object.entries(
      tool?.parameters.properties ?? {},
    )) {
      if (shared.has(key)) continue;
      const description = String(
        (schema as { description?: string }).description,
      );
      expect(description, key).toMatch(/^(edit|reframe|upscale|merge)[,.:]/);
    }
  });

  it('documents each declared field under an operation that accepts it', () => {
    for (const [key, schema] of Object.entries(
      tool?.parameters.properties ?? {},
    )) {
      if (key === 'operation' || key === 'brandId') continue;
      const owners = MEDIA_TRANSFORM_OPERATIONS.filter((operation) =>
        MEDIA_TRANSFORM_OPERATION_PARAMETERS[operation].has(key),
      );
      expect(owners.length, key).toBeGreaterThan(0);
      const description = String(
        (schema as { description?: string }).description,
      );
      for (const owner of owners) {
        expect(description, `${key} mentions ${owner}`).toContain(owner);
      }
    }
  });
});
