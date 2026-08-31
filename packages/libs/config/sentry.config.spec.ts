import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSentryConfig } from './sentry.config';

describe('getSentryConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when Sentry is explicitly disabled', () => {
    vi.stubEnv('SENTRY_ENABLED', 'false');

    expect(getSentryConfig({ serviceName: 'api' })).toBeNull();
  });

  it('returns null in development unless explicitly opted in', () => {
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SENTRY_DEV', '');
    vi.stubEnv('SENTRY_DSN', 'https://dev@sentry.io/1');

    expect(getSentryConfig({ serviceName: 'api' })).toBeNull();
  });

  it('returns null when no DSN is configured', () => {
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('SENTRY_DSN_API', '');

    expect(getSentryConfig({ serviceName: 'api' })).toBeNull();
  });

  it('prefers the service-specific DSN over the shared one', () => {
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_DSN', 'https://shared@sentry.io/1');
    vi.stubEnv('SENTRY_DSN_MY_SERVICE', 'https://service@sentry.io/2');
    vi.stubEnv('SENTRY_ENVIRONMENT', 'production');
    vi.stubEnv('npm_package_version', '3.2.1');

    expect(getSentryConfig({ serviceName: 'my-service' })).toEqual({
      dsn: 'https://service@sentry.io/2',
      environment: 'production',
      release: '3.2.1',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });

  it('falls back to the shared DSN and default environment/release', () => {
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'staging');
    vi.stubEnv('SENTRY_DSN', 'https://shared@sentry.io/1');
    vi.stubEnv('SENTRY_DSN_API', '');
    vi.stubEnv('SENTRY_ENVIRONMENT', '');
    vi.stubEnv('npm_package_version', '');

    expect(getSentryConfig({ serviceName: 'api' })).toEqual({
      dsn: 'https://shared@sentry.io/1',
      environment: 'development',
      release: '1.0.0',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });

  it('sends Sentry telemetry in development when SENTRY_DEV opts in', () => {
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SENTRY_DEV', 'true');
    vi.stubEnv('SENTRY_DSN', 'https://dev@sentry.io/1');
    vi.stubEnv('SENTRY_DSN_API', '');

    expect(getSentryConfig({ serviceName: 'api' })).toMatchObject({
      dsn: 'https://dev@sentry.io/1',
      sendDefaultPii: false,
    });
  });

  it('keeps sendDefaultPii false in every non-production environment', () => {
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('SENTRY_DEV', 'true');
    vi.stubEnv('SENTRY_DSN', 'https://shared@sentry.io/1');
    vi.stubEnv('SENTRY_DSN_API', '');

    for (const nodeEnv of ['development', 'test', 'staging'] as const) {
      vi.stubEnv('NODE_ENV', nodeEnv);

      expect(getSentryConfig({ serviceName: 'api' })).toMatchObject({
        sendDefaultPii: false,
      });
    }
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
