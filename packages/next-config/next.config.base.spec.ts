import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppNextConfig } from './next.config.base';

vi.mock('@sentry/nextjs/config', () => ({
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

describe('Sentry source maps', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('turns off Turbopack native debug IDs when Sentry uploads source maps', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'token');

    const config = createAppNextConfig({ sentryProject: 'app' });

    expect(config.turbopack?.debugIds).toBe(false);
  });

  it('leaves Turbopack settings alone when Sentry is not enabled', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');

    const config = createAppNextConfig({ sentryProject: 'app' });

    expect(config.turbopack?.debugIds).toBeUndefined();
  });
});
