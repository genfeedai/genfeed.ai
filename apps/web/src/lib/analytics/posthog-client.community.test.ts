import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from './analytics-events';

const mocks = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
  posthogImport: vi.fn(),
}));

vi.mock('posthog-js', () => {
  mocks.posthogImport();
  return {
    default: { capture: mocks.posthogCapture, init: vi.fn() },
  };
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

    const { captureAnalyticsEvent, initAnalytics, isAnalyticsEnabled } =
      await import('./posthog-client');

    expect(isAnalyticsEnabled()).toBe(false);
    captureAnalyticsEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {});
    initAnalytics();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.posthogImport).not.toHaveBeenCalled();
    expect(mocks.posthogCapture).not.toHaveBeenCalled();
  });
});
