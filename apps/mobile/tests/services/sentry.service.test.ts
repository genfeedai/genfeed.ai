import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
}));

vi.mock('@sentry/react-native', () => sentry);

describe('sentryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv(
      'EXPO_PUBLIC_SENTRY_DSN',
      'https://public@example.ingest.sentry.io/1',
    );
    vi.stubGlobal('__DEV__', false);
  });

  it('initializes native error reporting without performance tracing', async () => {
    const { sentryService } = await import('@/services/sentry.service');

    sentryService.init();

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        enableAutoPerformanceTracing: false,
        tracesSampleRate: 0,
      }),
    );
  });
});
