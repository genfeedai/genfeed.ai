import type * as Sentry from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn<(options: Parameters<typeof Sentry.init>[0]) => void>(),
  setTags: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentry);

import { initSentry } from './sentry.config.base';

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes restrictive error reporting without performance tracing by default', () => {
    initSentry();

    expect(sentry.init).toHaveBeenCalledWith(
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
  });

  it('passes an opted-in trace sample rate through', () => {
    initSentry({ tracesSampleRate: 0.05 });

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.05 }),
    );
  });

  it.each([true, false])(
    'scrubs OAuth secrets from streamed spans (segment=%s)',
    (isSegment) => {
      initSentry({ tracesSampleRate: 0.05 });
      const callback = sentry.init.mock.calls[0]?.[0]?.beforeSendSpan;
      expect(callback).toBeTypeOf('function');
      if (!callback)
        throw new Error('Expected the native streamed-span callback');

      const span = {
        attributes: {
          'http.query': '?code=secret&state=abc',
          'http.url': 'https://app.genfeed.ai/oauth/x?code=secret#fragment',
          'url.full':
            'https://app.genfeed.ai/oauth/x?oauth_verifier=secret#fragment',
          'url.query': '?code=secret',
          'http.fragment': '#access_token=secret',
          'url.fragment': 'access_token=secret',
          'http.request.method': 'GET',
          'custom.allowed': 42,
        },
        is_segment: isSegment,
        name: 'GET https://api.genfeed.ai/v1/x?token=secret#fragment',
        span_id: 'a',
        start_timestamp: 0,
        status: 'ok' as const,
        trace_id: 'b',
      };
      const scrubbed = callback(span);

      expect(scrubbed).toBe(span);
      expect(scrubbed.name).toBe('GET https://api.genfeed.ai/v1/x');
      expect(scrubbed.attributes).toEqual({
        'http.url': 'https://app.genfeed.ai/oauth/x',
        'url.full': 'https://app.genfeed.ai/oauth/x',
        'http.request.method': 'GET',
        'custom.allowed': 42,
      });
      expect(JSON.stringify(scrubbed)).not.toMatch(
        /secret|fragment|code=|token=/,
      );
    },
  );

  it('preserves spans without query strings and non-string URL attributes', () => {
    initSentry({ tracesSampleRate: 0.05 });
    const callback = sentry.init.mock.calls[0]?.[0]?.beforeSendSpan;
    expect(callback).toBeTypeOf('function');
    if (!callback)
      throw new Error('Expected the native streamed-span callback');

    const span = {
      attributes: {
        'http.url': 12,
        'url.full': false,
        'custom.allowed': 'value',
      },
      is_segment: false,
      name: 'GET /health',
      span_id: 'c',
      start_timestamp: 0,
      status: 'ok' as const,
      trace_id: 'b',
    };
    expect(callback(span)).toEqual(span);
  });
});
