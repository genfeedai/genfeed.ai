import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  posthogImport: vi.fn(),
}));

vi.mock('posthog-js', () => {
  mocks.posthogImport();
  return { default: { init: vi.fn() } };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Community analytics boundary', () => {
  it('disables analytics with a PostHog key in self-hosted web configuration', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', undefined);
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_testkey');

    const { initAnalytics, isAnalyticsEnabled } = await import(
      './posthog-client'
    );

    expect(isAnalyticsEnabled()).toBe(false);
    initAnalytics();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.posthogImport).not.toHaveBeenCalled();
  });
});
