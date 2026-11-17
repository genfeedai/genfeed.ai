import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addIntegration: vi.fn(),
  init: vi.fn(),
  initAnalytics: vi.fn(),
  recordHydrationEntryContext: vi.fn(),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
}));

vi.mock('@sentry/nextjs', () => ({
  addIntegration: mocks.addIntegration,
  captureRouterTransitionStart: vi.fn(),
  init: mocks.init,
  replayIntegration: mocks.replayIntegration,
}));

vi.mock('@/lib/analytics', () => ({
  initAnalytics: mocks.initAnalytics,
}));

vi.mock('@/lib/sentry/hydration-entry-context', () => ({
  recordHydrationEntryContext: mocks.recordHydrationEntryContext,
}));

vi.mock('@/lib/sentry/drop-json-api-object-rejection', () => ({
  dropUnhandledJsonApiObjectRejection: vi.fn((event: unknown) => event),
}));

describe('app Sentry instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // The module attaches error replay on a 2 s timer. Fake timers keep that
    // timer inside this test instead of firing in whichever file runs next.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(mocks.recordHydrationEntryContext).toHaveBeenCalledTimes(1);
  });

  it('attaches error replay with masked text and inputs once the page is idle', async () => {
    await import('./instrumentation-client');

    expect(mocks.replayIntegration).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(mocks.replayIntegration).toHaveBeenCalledWith({
      maskAllInputs: true,
      maskAllText: true,
    });
    expect(mocks.addIntegration).toHaveBeenCalledWith({ name: 'Replay' });
  });
});
