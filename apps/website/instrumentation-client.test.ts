import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  initWebsiteAnalytics: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureRouterTransitionStart: vi.fn(),
  init: mocks.init,
}));

vi.mock('./packages/analytics/posthog-client', () => ({
  initWebsiteAnalytics: mocks.initWebsiteAnalytics,
}));

describe('website Sentry instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('keeps error reporting and disables performance tracing', async () => {
    await import('./instrumentation-client');

    expect(mocks.init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0 }),
    );
    expect(mocks.initWebsiteAnalytics).toHaveBeenCalledTimes(1);
  });
});
