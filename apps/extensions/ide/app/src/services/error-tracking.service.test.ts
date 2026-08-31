import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const sentry = {
  captureException: mock(),
  close: mock(),
  init: mock(),
  setTag: mock(),
  withScope: mock(),
};

mock.module('@sentry/node', () => sentry);
mock.module('vscode', () => ({
  env: { appName: 'Cursor' },
  extensions: {
    getExtension: () => ({ packageJSON: { version: '1.2.3' } }),
  },
}));

describe('IDE extension error tracking', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sentry.init.mockClear();
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('initializes error reporting without performance tracing', async () => {
    const { initializeErrorTracking } = await import(
      './error-tracking.service'
    );

    initializeErrorTracking('extension');

    expect(sentry.init).toHaveBeenCalledWith({
      dsn: 'https://public@example.ingest.sentry.io/1',
      environment: 'production',
      release: 'ide-extension@1.2.3',
      tracesSampleRate: 0,
    });
  });
});
