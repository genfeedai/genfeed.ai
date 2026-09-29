import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSentryConfig } from './sentry.config';

describe('getSentryConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps tracing disabled in every environment', () => {
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('SENTRY_DEV', 'true');
    vi.stubEnv('SENTRY_DSN', 'https://shared@sentry.io/1');
    vi.stubEnv('SENTRY_DSN_API', '');

    for (const nodeEnv of [
      'development',
      'test',
      'staging',
      'production',
    ] as const) {
      vi.stubEnv('NODE_ENV', nodeEnv);

      expect(getSentryConfig({ serviceName: 'api' })).toMatchObject({
        tracesSampleRate: 0,
      });
    }
  });
});
