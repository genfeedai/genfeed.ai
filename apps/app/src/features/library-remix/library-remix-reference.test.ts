import { AGENT_ARTIFACT_SERIALIZER_BY_KIND } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildLibraryArtifactReference,
  buildLibraryRemixIntentHref,
  encodeLibraryRemixSource,
  parseLibraryRemixSource,
} from './library-remix-reference';

const context = {
  brandId: 'brand-1',
  organizationId: 'org-1',
};

describe('Library Remix references', () => {
  it('builds the existing canonical typed reference without redefining identity', () => {
    const reference = buildLibraryArtifactReference({
      ...context,
      kind: 'ingredient',
      recordId: 'ingredient_1',
    });

    expect(reference).toEqual({
      ...context,
      kind: 'ingredient',
      recordId: 'ingredient_1',
      serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND.ingredient,
    });
    expect(reference && encodeLibraryRemixSource(reference)).toBe(
      'ingredient:ingredient_1',
    );
  });

  it.each([
    '',
    'post:post-1',
    'ingredient:',
    ':ingredient-1',
    'ingredient:../../forged',
    'ingredient:undefined',
  ])('rejects malformed or unsupported source intent %s', (value) => {
    expect(parseLibraryRemixSource(value, context)).toBeNull();
  });

  it('reconstructs scope from effective context rather than URL authority', () => {
    expect(parseLibraryRemixSource('asset:asset-1', context)).toEqual({
      ...context,
      kind: 'asset',
      recordId: 'asset-1',
      serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND.asset,
    });
  });

  it('consumes overlay intent while preserving thread and unrelated route state', () => {
    const reference = buildLibraryArtifactReference({
      ...context,
      kind: 'ingredient',
      recordId: 'ingredient-1',
    });

    expect(
      reference &&
        buildLibraryRemixIntentHref(
          '/acme/moonrise/posts/remix?thread=thread-1&overlay=library-picker&folder=recent',
          reference,
        ),
    ).toBe(
      '/acme/moonrise/posts/remix?thread=thread-1&folder=recent&sourceArtifact=ingredient%3Aingredient-1',
    );
  });
});
