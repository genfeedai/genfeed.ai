import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  initAnalytics: vi.fn(),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
}));

vi.mock('@sentry/nextjs', () => ({
  captureRouterTransitionStart: vi.fn(),
  init: mocks.init,
  replayIntegration: mocks.replayIntegration,
}));

vi.mock('@/lib/analytics', () => ({
  initAnalytics: mocks.initAnalytics,
}));

vi.mock('@/lib/sentry/drop-json-api-object-rejection', () => ({
  dropUnhandledJsonApiObjectRejection: vi.fn((event: unknown) => event),
}));

describe('app Sentry instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('keeps error reporting and disables performance tracing', async () => {
    await import('./instrumentation-client');

    expect(mocks.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dataCollection: {
          cookies: false,
          databaseQueryData: false,
          genAI: { inputs: false, outputs: false },
          graphQL: { document: false, variables: false },
          httpBodies: [],
          httpHeaders: {
            request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
            response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
          },
          queues: false,
          urlQueryParams: {
            deny: ['forwarded', '-ip', 'remote-', 'via', '-user'],
          },
          userInfo: false,
        },
        tracesSampleRate: 0,
      }),
    );
    expect(mocks.initAnalytics).toHaveBeenCalledTimes(1);
  });
});
