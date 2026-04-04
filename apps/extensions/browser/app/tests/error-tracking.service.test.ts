import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => {
  const scope = {
    setContext: vi.fn(),
    setLevel: vi.fn(),
    setTag: vi.fn(),
  };

  return {
    captureException: vi.fn(),
    init: vi.fn(),
    scope,
    setTag: vi.fn(),
    withScope: vi.fn((callback: (value: typeof scope) => void) => {
      callback(scope);
    }),
  };
});

vi.mock('@sentry/browser', () => ({
  captureException: sentryMocks.captureException,
  init: sentryMocks.init,
  setTag: sentryMocks.setTag,
  withScope: sentryMocks.withScope,
}));

async function importErrorTrackingService(params?: {
  nodeEnv?: string;
  plasmoEnv?: string;
  sentryDsn?: string;
}) {
  vi.resetModules();

  process.env.NODE_ENV = params?.nodeEnv ?? 'production';
  process.env.PLASMO_PUBLIC_ENV = params?.plasmoEnv ?? 'production';
  process.env.PLASMO_PUBLIC_APP_VERSION = '1.2.3';

  if (params?.sentryDsn === undefined) {
    delete process.env.PLASMO_PUBLIC_SENTRY_DSN;
  } else {
    process.env.PLASMO_PUBLIC_SENTRY_DSN = params.sentryDsn;
  }

  return import('../src/services/error-tracking.service');
}

describe('error-tracking.service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('initializes Sentry for production entrypoints with a DSN', async () => {
    const { initializeErrorTracking } = await importErrorTrackingService({
      sentryDsn: 'https://public@example.ingest.sentry.io/1',
    });

    initializeErrorTracking('popup');

    expect(sentryMocks.init).toHaveBeenCalledWith({
      dsn: 'https://public@example.ingest.sentry.io/1',
      environment: 'production',
      release: '1.2.3',
      tracesSampleRate: 0.1,
    });
    expect(sentryMocks.setTag).toHaveBeenCalledWith('app', 'extension');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('entrypoint', 'popup');
    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'website_domain',
      'https://genfeed.ai',
    );
  });

  it('skips initialization outside production', async () => {
    const { initializeErrorTracking } = await importErrorTrackingService({
      nodeEnv: 'test',
      plasmoEnv: 'development',
      sentryDsn: 'https://public@example.ingest.sentry.io/1',
    });

    initializeErrorTracking('popup');

    expect(sentryMocks.init).not.toHaveBeenCalled();
    expect(sentryMocks.setTag).not.toHaveBeenCalled();
  });

  it('captures runtime errors with extension context in production', async () => {
    const error = new Error('boom');
    const { captureExtensionError } = await importErrorTrackingService({
      sentryDsn: 'https://public@example.ingest.sentry.io/1',
    });

    captureExtensionError('failed to post reply', error, {
      route: 'sidepanel',
    });

    expect(sentryMocks.withScope).toHaveBeenCalledTimes(1);
    expect(sentryMocks.scope.setLevel).toHaveBeenCalledWith('error');
    expect(sentryMocks.scope.setContext).toHaveBeenCalledWith('extension', {
      route: 'sidepanel',
    });
    expect(sentryMocks.scope.setTag).toHaveBeenCalledWith('source', 'logger');
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });

  it('wraps non-Error runtime failures before reporting them', async () => {
    const { captureExtensionError } = await importErrorTrackingService({
      sentryDsn: 'https://public@example.ingest.sentry.io/1',
    });

    captureExtensionError('request failed');

    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'request failed',
      }),
    );
  });
});
