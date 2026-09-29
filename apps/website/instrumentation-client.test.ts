import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  initSignupAttribution: vi.fn(),
  initWebsiteAnalytics: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  init: mocks.init,
}));

vi.mock('./packages/analytics/posthog-client', () => ({
  initWebsiteAnalytics: mocks.initWebsiteAnalytics,
}));

vi.mock('./packages/analytics/signup-attribution', () => ({
  initSignupAttribution: mocks.initSignupAttribution,
}));

describe('website Sentry instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal('requestIdleCallback', (callback: () => void): number => {
      callback();
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps error reporting and disables performance tracing', async () => {
    await import('./instrumentation-client');

    await vi.waitFor(() =>
      expect(mocks.init).toHaveBeenCalledWith(
        expect.objectContaining({ tracesSampleRate: 0 }),
      ),
    );
    expect(mocks.initWebsiteAnalytics).toHaveBeenCalledTimes(1);
    expect(mocks.initSignupAttribution).toHaveBeenCalledTimes(1);
  });

  // The SDK is ~75 KB gzip; it must not be part of the first-load bundle.
});
