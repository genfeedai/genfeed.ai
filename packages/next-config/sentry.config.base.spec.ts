import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  setTags: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentry);

import {
  initSentry,
  stripQueryStringsFromTransaction,
} from './sentry.config.base';

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes Next.js error reporting without performance tracing by default', () => {
    initSentry();

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0 }),
    );
  });

  it('passes an opted-in trace sample rate through', () => {
    initSentry({ tracesSampleRate: 0.05 });

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.05 }),
    );
  });
});

describe('stripQueryStringsFromTransaction', () => {
  it('removes OAuth callback query strings from the request and its spans', () => {
    const event = {
      contexts: {
        trace: {
          data: {
            'http.query': '?code=secret&state=abc',
            'url.full': 'https://app.genfeed.ai/oauth/x?oauth_verifier=secret',
          },
          span_id: 'a',
          trace_id: 'b',
        },
      },
      request: {
        query_string: 'code=secret&state=abc',
        url: 'https://app.genfeed.ai/oauth/x?code=secret&state=abc#frag',
      },
      spans: [
        {
          data: { 'url.query': '?code=secret' },
          description: 'GET https://api.genfeed.ai/v1/x?token=1',
          span_id: 'c',
          start_timestamp: 0,
          trace_id: 'b',
        },
      ],
    } as never;

    const scrubbed = stripQueryStringsFromTransaction(event) as never as {
      contexts: { trace: { data: Record<string, unknown> } };
      request: Record<string, unknown>;
      spans: Array<{ data: Record<string, unknown>; description: string }>;
    };

    expect(scrubbed.request).toEqual({
      url: 'https://app.genfeed.ai/oauth/x',
    });
    expect(scrubbed.contexts.trace.data).toEqual({
      'url.full': 'https://app.genfeed.ai/oauth/x',
    });
    expect(scrubbed.spans[0]?.data).toEqual({});
    expect(scrubbed.spans[0]?.description).toBe(
      'GET https://api.genfeed.ai/v1/x',
    );
  });

  it('is installed as the transaction hook', () => {
    initSentry({ tracesSampleRate: 0.05 });

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeSendTransaction: stripQueryStringsFromTransaction,
      }),
    );
  });
});
