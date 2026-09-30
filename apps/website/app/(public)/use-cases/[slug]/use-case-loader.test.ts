import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
  };
});

import { formatUseCaseSlug } from './use-case-loader';

describe('formatUseCaseSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('title-cases hyphenated use-case slugs', () => {
    expect(formatUseCaseSlug('agencies')).toBe('Agencies');
    expect(formatUseCaseSlug('social-media-managers')).toBe(
      'Social Media Managers',
    );
  });

  it('returns an empty string for an empty slug', () => {
    expect(formatUseCaseSlug('')).toBe('');
  });
});
