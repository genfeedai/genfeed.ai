import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Community analytics boundary', () => {
  it('disables analytics with a PostHog key in self-hosted web configuration', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', undefined);
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key');

    const { isAnalyticsEnabled } = await import('./posthog-client');

    expect(isAnalyticsEnabled()).toBe(false);
  });
});
