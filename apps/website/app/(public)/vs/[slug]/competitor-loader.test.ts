import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
  };
});

import { formatCompetitorSlug } from './competitor-loader';

describe('formatCompetitorSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('title-cases hyphenated competitor slugs', () => {
    expect(formatCompetitorSlug('buffer')).toBe('Buffer');
    expect(formatCompetitorSlug('hootsuite')).toBe('Hootsuite');
    expect(formatCompetitorSlug('later-social')).toBe('Later Social');
  });

  it('returns an empty string for an empty slug', () => {
    expect(formatCompetitorSlug('')).toBe('');
  });
});
