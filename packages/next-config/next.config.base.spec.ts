import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern';
import { describe, expect, it, vi } from 'vitest';
import { createAppNextConfig } from './next.config.base';

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: (config: unknown) => config,
}));

describe('Instagram candidate avatars', () => {
  const config = createAppNextConfig({});
  const patterns = config.images?.remotePatterns ?? [];

  it.each([
    'https://scontent.cdninstagram.com/avatar.jpg',
    'https://scontent-lhr8-1.cdninstagram.com/avatar.jpg',
    'https://scontent-fmla1-1.fbcdn.net/avatar.jpg',
    'https://scontent.fmla1-1.fna.fbcdn.net/avatar.jpg',
    'https://scontent.regional.cdninstagram.com/avatar.jpg',
  ])('allows Meta avatar %s', (url) => {
    expect(hasRemoteMatch([], patterns, new URL(url))).toBe(true);
  });

  it.each([
    'http://scontent.cdninstagram.com/avatar.jpg',
    'http://scontent-lhr8-1.fbcdn.net/avatar.jpg',
    'https://unrelated.example/avatar.jpg',
    'https://cdninstagram.com.evil.example/avatar.jpg',
    'https://fakecdninstagram.com/avatar.jpg',
    'https://fbcdn.net.evil.example/avatar.jpg',
  ])('rejects untrusted avatar %s', (url) => {
    expect(hasRemoteMatch([], patterns, new URL(url))).toBe(false);
  });

  it('preserves the unoptimized image policy', () => {
    expect(config.images?.unoptimized).toBe(true);
  });
});
