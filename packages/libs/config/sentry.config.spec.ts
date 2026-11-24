import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSentryConfig,
  PRODUCTION_TRACES_SAMPLE_RATE,
  redactBreadcrumbUrls,
  redactSpanUrls,
  UNAVAILABLE_SOURCE_VIDEO_PATTERN,
} from './sentry.config';

describe('redactSpanUrls', () => {
  it('removes webhook and bot tokens from a streamed HTTP span', () => {
    const span = redactSpanUrls({
      attributes: {
        'http.method': 'POST',
        'http.url': 'https://discord.com/api/webhooks/123456789/abc-DEF_ghi',
        'url.full':
          'https://api.telegram.org/bot123456:AAH-xyz_123/sendMessage',
      },
      name: 'POST https://discord.com/api/webhooks/123456789/abc-DEF_ghi',
    });

    expect(span).toEqual({
      attributes: {
        'http.method': 'POST',
        'http.url': 'https://discord.com/api/webhooks/123456789/[REDACTED]',
        'url.full': 'https://api.telegram.org/bot[REDACTED]/sendMessage',
      },
      name: 'POST https://discord.com/api/webhooks/123456789/[REDACTED]',
    });
  });

  it('removes webhook and bot tokens from a sampled HTTP span', () => {
    const span = redactSpanUrls({
      data: {
        'http.url': 'https://discord.com/api/webhooks/123456789/abc-DEF_ghi',
        'url.full':
          'https://api.telegram.org/bot123456:AAH-xyz_123/sendMessage',
      },
      description:
        'POST https://discord.com/api/webhooks/123456789/abc-DEF_ghi',
    });

    expect(span).toEqual({
      data: {
        'http.url': 'https://discord.com/api/webhooks/123456789/[REDACTED]',
        'url.full': 'https://api.telegram.org/bot[REDACTED]/sendMessage',
      },
      description: 'POST https://discord.com/api/webhooks/123456789/[REDACTED]',
    });
  });
});

describe('redactBreadcrumbUrls', () => {
  it('removes webhook and bot tokens from an HTTP breadcrumb URL', () => {
    expect(
      redactBreadcrumbUrls({
        category: 'http',
        data: { url: 'https://discord.com/api/webhooks/123456789/abc-DEF_ghi' },
      }).data?.url,
    ).toBe('https://discord.com/api/webhooks/123456789/[REDACTED]');
    expect(
      redactBreadcrumbUrls({
        category: 'http',
        data: {
          url: 'https://api.telegram.org/bot123456:AAH-xyz_123/sendMessage',
        },
      }).data?.url,
    ).toBe('https://api.telegram.org/bot[REDACTED]/sendMessage');
  });
});

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
      beforeBreadcrumb: redactBreadcrumbUrls,
      beforeSendSpan: redactSpanUrls,
      dsn: 'https://service@sentry.io/2',
      environment: 'production',
      ignoreErrors: [UNAVAILABLE_SOURCE_VIDEO_PATTERN],
      release: '3.2.1',
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
      propagateTraceparent: true,
      tracesSampleRate: PRODUCTION_TRACES_SAMPLE_RATE,
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
      beforeBreadcrumb: redactBreadcrumbUrls,
      beforeSendSpan: redactSpanUrls,
      dsn: 'https://shared@sentry.io/1',
      environment: 'development',
      ignoreErrors: [UNAVAILABLE_SOURCE_VIDEO_PATTERN],
      release: '1.0.0',
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
      propagateTraceparent: true,
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
    });
  });

  it('keeps restrictive collection in every non-production environment', () => {
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('SENTRY_DEV', 'true');
    vi.stubEnv('SENTRY_DSN', 'https://shared@sentry.io/1');
    vi.stubEnv('SENTRY_DSN_API', '');

    for (const nodeEnv of ['development', 'test', 'staging'] as const) {
      vi.stubEnv('NODE_ENV', nodeEnv);

      expect(getSentryConfig({ serviceName: 'api' })).toMatchObject({
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
      });
    }
  });

  it('samples traces in production only', () => {
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('SENTRY_DEV', 'true');
    vi.stubEnv('SENTRY_DSN', 'https://shared@sentry.io/1');
    vi.stubEnv('SENTRY_DSN_API', '');

    for (const nodeEnv of ['development', 'test', 'staging'] as const) {
      vi.stubEnv('NODE_ENV', nodeEnv);

      expect(getSentryConfig({ serviceName: 'api' })).toMatchObject({
        tracesSampleRate: 0,
      });
    }

    vi.stubEnv('NODE_ENV', 'production');

    expect(getSentryConfig({ serviceName: 'api' })).toMatchObject({
      tracesSampleRate: PRODUCTION_TRACES_SAMPLE_RATE,
    });
  });
});

describe('UNAVAILABLE_SOURCE_VIDEO_PATTERN', () => {
  it.each([
    'yt-dlp exited with code 1: ERROR: [youtube] dQw4w9WgXcQ: This video is unavailable',
    'Video-to-audio conversion failed: yt-dlp exited with code 1: ERROR: [youtube] abc-DEF_123: Private video. Sign in if you\'ve been granted access to this video',
    'Nodes failed: prepare-source: Audio extraction job 345eddc6 failed: yt-dlp exited with code 1: ERROR: [youtube] abc: Video unavailable',
  ])('drops a removed or private source video: %s', (message) => {
    expect(UNAVAILABLE_SOURCE_VIDEO_PATTERN.test(message)).toBe(true);
  });

  it.each([
    'yt-dlp exited with code 1: ERROR: [youtube] abc: Sign in to confirm you’re not a bot',
    'yt-dlp exited with code 1: ERROR: unable to download video data: HTTP Error 403',
    'yt-dlp timed out after 600000ms',
  ])('keeps a failure that may be ours: %s', (message) => {
    expect(UNAVAILABLE_SOURCE_VIDEO_PATTERN.test(message)).toBe(false);
  });
});
