import {
  createServer,
  type IncomingHttpHeaders,
  IncomingMessage,
  request,
  type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { Socket } from 'node:net';
import { getSentryConfig } from '@libs/config/sentry.config';
import {
  applyIncomingTraceparent,
  continueIncomingTraceparent,
  registerSpanRequestContext,
  sentryTraceFromTraceparent,
  setSpanRequestContext,
} from '@libs/tracing/span-request-context';
import {
  flush,
  init,
  type StreamedSpanJSON,
  startSpan,
  suppressTracing,
  withIsolationScope,
} from '@sentry/nestjs';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const PARENT_SPAN_ID = 'b7ad6b7169203331';
const TRACEPARENT = `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`;

const sentSpans: StreamedSpanJSON[] = [];

function spanNamed(name: string): StreamedSpanJSON | undefined {
  return sentSpans.find((span) => span.name === name);
}

function incomingRequest(headers: Record<string, string>): IncomingMessage {
  const message = new IncomingMessage(new Socket());
  message.headers = headers;
  return message;
}

describe('sentryTraceFromTraceparent', () => {
  it.each([
    [TRACEPARENT, `${TRACE_ID}-${PARENT_SPAN_ID}`],
    [`00-${TRACE_ID}-${PARENT_SPAN_ID}-00`, `${TRACE_ID}-${PARENT_SPAN_ID}`],
    [
      `  00-${TRACE_ID.toUpperCase()}-${PARENT_SPAN_ID}-01 `,
      `${TRACE_ID}-${PARENT_SPAN_ID}`,
    ],
    [`01-${TRACE_ID}-${PARENT_SPAN_ID}-01`, undefined],
    [`00-${'0'.repeat(32)}-${PARENT_SPAN_ID}-01`, undefined],
    [`00-${TRACE_ID}-${'0'.repeat(16)}-01`, undefined],
    ['not-a-traceparent', undefined],
    [undefined, undefined],
  ])('maps %s to %s', (traceparent, expected) => {
    expect(sentryTraceFromTraceparent(traceparent)).toBe(expected);
  });
});

describe('applyIncomingTraceparent', () => {
  it('adds a sentry-trace header from a W3C traceparent', () => {
    const message = incomingRequest({ traceparent: TRACEPARENT });

    applyIncomingTraceparent(message);

    expect(message.headers['sentry-trace']).toBe(
      `${TRACE_ID}-${PARENT_SPAN_ID}`,
    );
  });

  it('keeps a sentry-trace header the caller already sent', () => {
    const message = incomingRequest({
      'sentry-trace': 'ffffffffffffffffffffffffffffffff-aaaaaaaaaaaaaaaa-1',
      traceparent: TRACEPARENT,
    });

    applyIncomingTraceparent(message);

    expect(message.headers['sentry-trace']).toBe(
      'ffffffffffffffffffffffffffffffff-aaaaaaaaaaaaaaaa-1',
    );
  });
});

describe('span request context', () => {
  let server: Server;
  const receivedHeaders: IncomingHttpHeaders[] = [];

  function get(path: string, headers: Record<string, string> = {}) {
    const { port } = server.address() as AddressInfo;

    return new Promise<void>((resolve, reject) => {
      request({ headers, path, port }, (res) => {
        res.resume();
        res.on('end', resolve);
      })
        .on('error', reject)
        .end();
    });
  }

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_ENABLED', 'true');
    vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0');
    const config = getSentryConfig({ serviceName: 'api' });
    vi.unstubAllEnvs();

    init({
      ...config,
      beforeSendSpan(span) {
        sentSpans.push(span);
        return span;
      },
      tracesSampleRate: 1,
      transport: () => ({
        flush: async () => true,
        send: async () => ({}),
      }),
    });
    registerSpanRequestContext();
    continueIncomingTraceparent();

    server = createServer((req, res) => {
      receivedHeaders.push(req.headers);
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    sentSpans.length = 0;
    receivedHeaders.length = 0;
  });

  it('stamps request identity on every span that ends after auth', async () => {
    await withIsolationScope(() =>
      startSpan({ name: 'GET /v1/brands', op: 'http.server' }, async () => {
        await startSpan({ name: 'auth-guard' }, async () => {
          setSpanRequestContext({
            brandId: 'brand_1',
            isSuperAdmin: false,
            organizationId: 'org_1',
            subscriptionTier: 'pro',
            userId: 'user_1',
          });
        });
        await startSpan({ name: 'BrandsService.findAll' }, async () => {
          throw new Error('boom');
        }).catch(() => undefined);
      }),
    );
    await flush(1000);

    const identity = {
      'genfeed.brand_id': 'brand_1',
      'genfeed.is_super_admin': false,
      'genfeed.organization_id': 'org_1',
      'genfeed.subscription_tier': 'pro',
      'genfeed.user_id': 'user_1',
    };
    expect(spanNamed('GET /v1/brands')?.attributes).toEqual(
      expect.objectContaining({ ...identity, 'genfeed.outcome': 'success' }),
    );
    expect(spanNamed('auth-guard')?.attributes).toEqual(
      expect.objectContaining({ ...identity, 'genfeed.outcome': 'success' }),
    );
    expect(spanNamed('BrandsService.findAll')?.attributes).toEqual(
      expect.objectContaining({ ...identity, 'genfeed.outcome': 'error' }),
    );
  });

  it('gives a span that ended before auth its outcome only', async () => {
    await withIsolationScope(() =>
      startSpan({ name: 'GET /v1/posts' }, async () => {
        await startSpan({ name: 'cors' }, async () => undefined);
        setSpanRequestContext({ organizationId: 'org_1' });
      }),
    );
    await flush(1000);

    expect(spanNamed('cors')?.attributes).toEqual(
      expect.objectContaining({ 'genfeed.outcome': 'success' }),
    );
    expect(spanNamed('cors')?.attributes).not.toHaveProperty(
      'genfeed.organization_id',
    );
  });

  it('keeps one request identity from leaking into another', async () => {
    await withIsolationScope(() =>
      startSpan({ name: 'request-a' }, async () => {
        setSpanRequestContext({ organizationId: 'org_a' });
      }),
    );
    await withIsolationScope(() =>
      startSpan({ name: 'request-b' }, async () => undefined),
    );
    await flush(1000);

    expect(spanNamed('request-a')?.attributes).toEqual(
      expect.objectContaining({ 'genfeed.organization_id': 'org_a' }),
    );
    expect(spanNamed('request-b')?.attributes).not.toHaveProperty(
      'genfeed.organization_id',
    );
  });

  it('continues the trace of an incoming W3C traceparent', async () => {
    await suppressTracing(() => get('/health', { traceparent: TRACEPARENT }));
    await flush(1000);

    expect(sentSpans.find((span) => span.is_segment)).toEqual(
      expect.objectContaining({
        parent_span_id: PARENT_SPAN_ID,
        trace_id: TRACE_ID,
      }),
    );
  });

  it('forwards W3C traceparent on outgoing requests', async () => {
    let traceId = '';

    await startSpan({ name: 'outgoing' }, async (span) => {
      traceId = span.spanContext().traceId;
      await get('/downstream');
    });

    expect(receivedHeaders[0]?.traceparent).toMatch(
      new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`),
    );
  });
});
