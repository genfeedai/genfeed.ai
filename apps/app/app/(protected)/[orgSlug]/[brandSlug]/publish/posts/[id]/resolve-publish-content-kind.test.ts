import { describe, expect, it, vi } from 'vitest';

import {
  resolvePublishContentKindFromId,
  resolvePublishContentKindFromQuery,
} from './resolve-publish-content-kind';

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

describe('resolvePublishContentKindFromId', () => {
  it('returns post when the id exists in posts', async () => {
    const kind = await resolvePublishContentKindFromId('post-1', {
      articles: mockLookup('miss'),
      newsletters: mockLookup('miss'),
      posts: mockLookup('ok'),
    });
    expect(kind).toBe('post');
  });

  it('returns article when only articles has the id (no query param needed)', async () => {
    const kind = await resolvePublishContentKindFromId('article-1', {
      articles: mockLookup('ok'),
      newsletters: mockLookup('miss'),
      posts: mockLookup('miss'),
    });
    expect(kind).toBe('article');
  });

  it('returns newsletter when only newsletters has the id', async () => {
    const kind = await resolvePublishContentKindFromId('nl-1', {
      articles: mockLookup('miss'),
      newsletters: mockLookup('ok'),
      posts: mockLookup('miss'),
    });
    expect(kind).toBe('newsletter');
  });

  it('prefers post over article if both somehow match', async () => {
    const kind = await resolvePublishContentKindFromId('shared-id', {
      articles: mockLookup('ok'),
      newsletters: mockLookup('ok'),
      posts: mockLookup('ok'),
    });
    expect(kind).toBe('post');
  });

  it('returns null when nothing matches', async () => {
    const kind = await resolvePublishContentKindFromId('missing', {
      articles: mockLookup('miss'),
      newsletters: mockLookup('miss'),
      posts: mockLookup('miss'),
    });
    expect(kind).toBeNull();
  });
});

describe('resolvePublishContentKindFromQuery', () => {
  it('still parses legacy kind query values for tests/compat', () => {
    expect(resolvePublishContentKindFromQuery(null)).toBe('post');
    expect(resolvePublishContentKindFromQuery('article')).toBe('article');
    expect(resolvePublishContentKindFromQuery('video')).toBeNull();
  });
});
