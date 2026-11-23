import { describe, expect, it } from 'vitest';
import {
  createRetiredReferenceRewriter,
  rewriteSchemaDescriptions,
} from './references';

const rewrite = createRetiredReferenceRewriter([
  {
    action: 'brands',
    canonicalName: 'get_context',
    executionName: 'get_brands',
  },
  {
    action: 'brand_context',
    canonicalName: 'get_context',
    executionName: 'get_brand_context',
  },
]);

describe('retired tool reference rewriting', () => {
  it('names the call that replaces a retired tool', () => {
    expect(
      rewrite('Pick a brand from get_brands, then get_brand_context.'),
    ).toBe(
      'Pick a brand from get_context(action=brands), then get_context(action=brand_context).',
    );
  });

  it('leaves longer names and unrelated words alone', () => {
    expect(rewrite('get_brands_extra and my_get_brands stay.')).toBe(
      'get_brands_extra and my_get_brands stay.',
    );
  });

  it('does nothing when no tool is retired', () => {
    expect(createRetiredReferenceRewriter([])('call get_brands')).toBe(
      'call get_brands',
    );
  });

  it('rewrites every description in a schema and nothing else', () => {
    expect(
      rewriteSchemaDescriptions(
        {
          description: 'Use get_brands.',
          properties: {
            description: { type: 'string' },
            id: { default: 'get_brands', description: 'From get_brands.' },
          },
          required: ['get_brands'],
        },
        rewrite,
      ),
    ).toEqual({
      description: 'Use get_context(action=brands).',
      properties: {
        description: { type: 'string' },
        id: {
          default: 'get_brands',
          description: 'From get_context(action=brands).',
        },
      },
      required: ['get_brands'],
    });
  });
});
