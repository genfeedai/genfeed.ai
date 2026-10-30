import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

vi.mock('./src/analytics/posthog-client', () => ({
  initWebsiteAnalytics: mocks.initWebsiteAnalytics,
}));

vi.mock('./src/analytics/signup-attribution', () => ({
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
        expect.objectContaining({
          dataCollection: {
            cookies: false,
            databaseQueryData: false,
            genAI: { inputs: false, outputs: false },
            graphQL: { document: false, variables: false },
            httpBodies: [],
            httpHeaders: {
              request: {
                deny: ['forwarded', '-ip', 'remote-', 'via', '-user'],
              },
              response: {
                deny: ['forwarded', '-ip', 'remote-', 'via', '-user'],
              },
            },
            queues: false,
            urlQueryParams: {
              deny: ['forwarded', '-ip', 'remote-', 'via', '-user'],
            },
            userInfo: false,
          },
          tracesSampleRate: 0,
        }),
      ),
    );
    expect(mocks.initWebsiteAnalytics).toHaveBeenCalledTimes(1);
    expect(mocks.initSignupAttribution).toHaveBeenCalledTimes(1);
  });

  // The SDK is ~75 KB gzip; it must not be part of the first-load bundle.
  it('never imports the Sentry SDK statically', () => {
    const source = readFileSync(
      join(process.cwd(), 'instrumentation-client.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/^import[^;]*'@sentry\/nextjs'/m);
  });
});
