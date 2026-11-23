import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SentryInitOptions = Parameters<typeof import('@sentry/nextjs').init>[0];

// What the module handed to Sentry and to analytics, in the order it did so.
const recorded = vi.hoisted(() => ({
  analyticsInits: 0,
  hydrationRecords: 0,
  integrations: [] as unknown[],
  replayOptions: [] as unknown[],
  sentryInitOptions: [] as SentryInitOptions[],
}));

vi.mock('@sentry/nextjs', () => ({
  addIntegration: (integration: unknown) => {
    recorded.integrations.push(integration);
  },
  captureRouterTransitionStart: vi.fn(),
  init: (options: SentryInitOptions) => {
    recorded.sentryInitOptions.push(options);
  },
  replayIntegration: (options: unknown) => {
    recorded.replayOptions.push(options);
    return { name: 'Replay' };
  },
}));

vi.mock('@/lib/analytics', () => ({
  initAnalytics: () => {
    recorded.analyticsInits += 1;
  },
}));

vi.mock('@/lib/sentry/hydration-entry-context', () => ({
  recordHydrationEntryContext: () => {
    recorded.hydrationRecords += 1;
  },
}));

vi.mock('@/lib/sentry/heap-watchdog', () => ({
  startHeapWatchdog: vi.fn(() => () => undefined),
}));

vi.mock('@/lib/sentry/drop-json-api-object-rejection', () => ({
  dropUnhandledJsonApiObjectRejection: vi.fn((event: unknown) => event),
}));

describe('app Sentry instrumentation', () => {
  beforeEach(() => {
    recorded.analyticsInits = 0;
    recorded.hydrationRecords = 0;
    recorded.integrations.length = 0;
    recorded.replayOptions.length = 0;
    recorded.sentryInitOptions.length = 0;
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

    expect(recorded.sentryInitOptions).toEqual([
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
    ]);
    expect(recorded.analyticsInits).toBe(1);
    expect(recorded.hydrationRecords).toBe(1);
  });

  it('tags the original production hydration event with only its React error code', async () => {
    await import('./instrumentation-client');

    const [options] = recorded.sentryInitOptions;
    const event = await options.beforeSend?.(
      {
        exception: {
          values: [
            {
              value:
                'Minified React error #418; visit https://react.dev/errors/418?args[]=fixture for the full message. <private-fixture>',
            },
          ],
        },
        tags: { existing: 'kept' },
        type: undefined,
      },
      {},
    );

    expect(event?.tags).toEqual({
      existing: 'kept',
      hydration_message: 'Minified React error #418',
    });
  });

  it('attaches error replay with masked text and inputs once the page is idle', async () => {
    await import('./instrumentation-client');

    expect(recorded.integrations).toEqual([]);

    await vi.runOnlyPendingTimersAsync();

    expect(recorded.replayOptions).toEqual([
      { maskAllInputs: true, maskAllText: true },
    ]);
    expect(recorded.integrations).toEqual([{ name: 'Replay' }]);
  });
});
