import { describe, expect, it, vi } from 'vitest';

import { resolvePublishingContentKindFromId } from './resolve-publishing-content-kind';

function mockLookup(result: 'ok' | 'miss'): {
  findOne: ReturnType<typeof vi.fn>;
} {
  return {
    findOne: vi.fn(async () => {
      if (result === 'ok') {
        return { id: 'x' };
      }
      throw new Error('not found');
    }),
  };
}

describe('resolvePublishingContentKindFromId', () => {
  it('prefers post over article if both somehow match', async () => {
    const kind = await resolvePublishingContentKindFromId('shared-id', {
      articles: mockLookup('ok'),
      newsletters: mockLookup('ok'),
      posts: mockLookup('ok'),
    });
    expect(kind).toBe('post');
  });
});
