import type { AgentArtifactReference } from '@genfeedai/interfaces';
import {
  buildContextualRemixHref,
  encodeContextualRemixSource,
} from './contextual-remix-url.util';

describe('contextual-remix-url.util', () => {
  const reference: Extract<AgentArtifactReference, { kind: 'ingredient' }> = {
    brandId: 'brand-1',
    kind: 'ingredient',
    organizationId: 'org-1',
    recordId: 'ingredient-1',
    recordVersion: '7',
    serializer: 'ingredient',
  };

  it('encodes only the typed record identity', () => {
    expect(encodeContextualRemixSource(reference)).toBe(
      'ingredient:ingredient-1',
    );
  });

  it('preserves opaque route state and pins the selected record version', () => {
    expect(
      buildContextualRemixHref(
        '/acme/moonrise/posts/remix?thread=thread-1&overlay=library-picker',
        reference,
      ),
    ).toBe(
      '/acme/moonrise/posts/remix?thread=thread-1&sourceArtifact=ingredient%3Aingredient-1&sourceVersion=7',
    );
  });
});
