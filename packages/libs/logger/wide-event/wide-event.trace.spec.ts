import {
  continueTrace,
  init,
  startSpan,
  startSpanManual,
} from '@sentry/nestjs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  resolveRequestId,
  resolveServiceIdentity,
  resolveTraceContext,
} from './wide-event.trace';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const PARENT_SPAN_ID = '00f067aa0ba902b7';

describe('resolveTraceContext', () => {
  it('continues the trace of an incoming traceparent', () => {
    const context = resolveTraceContext({
      traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`,
    });

    expect(context.traceId).toBe(TRACE_ID);
    expect(context.parentSpanId).toBe(PARENT_SPAN_ID);
    expect(context.spanId).toMatch(/^[\da-f]{16}$/);
    expect(context.spanId).not.toBe(PARENT_SPAN_ID);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-traceparent'],
    ['an all-zero trace id', `00-${'0'.repeat(32)}-${PARENT_SPAN_ID}-01`],
    ['an all-zero span id', `00-${TRACE_ID}-${'0'.repeat(16)}-01`],
  ])('starts a new trace when traceparent is %s', (_label, traceparent) => {
    const context = resolveTraceContext({ traceparent });

    expect(context.traceId).toMatch(/^[\da-f]{32}$/);
    expect(context.traceId).not.toBe(TRACE_ID);
    expect(context.parentSpanId).toBeUndefined();
  });
});

describe('resolveTraceContext inside a Sentry span', () => {
  beforeAll(() => {
    init({
      dsn: 'https://public@o0.ingest.sentry.io/0',
      tracesSampleRate: 1,
      transport: () => ({
        flush: async () => true,
        send: async () => ({}),
      }),
    });
  });

  it('takes the ids of the active request span', () => {
    const [context, spanContext] = startSpanManual(
      { name: 'GET /v1/brands' },
      (span) => {
        const result = [
          resolveTraceContext(undefined),
          span.spanContext(),
        ] as const;
        span.end();
        return result;
      },
    );

    expect(context).toEqual({
      spanId: spanContext.spanId,
      traceId: spanContext.traceId,
    });
  });

  it('keeps the upstream parent when the span continues an incoming trace', () => {
    const traceparent = `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`;

    const [context, spanId] = continueTrace(
      { baggage: undefined, sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-1` },
      () =>
        startSpan({ name: 'GET /v1/posts' }, (span) => [
          resolveTraceContext({ traceparent }),
          span.spanContext().spanId,
        ]),
    );

    expect(context).toEqual({
      parentSpanId: PARENT_SPAN_ID,
      spanId,
      traceId: TRACE_ID,
    });
  });

  it('falls back to the incoming traceparent outside any span', () => {
    expect(
      resolveTraceContext({
        traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`,
      }),
    ).toEqual(
      expect.objectContaining({
        parentSpanId: PARENT_SPAN_ID,
        traceId: TRACE_ID,
      }),
    );
  });
});

describe('resolveRequestId', () => {
  it('keeps a well-formed caller-supplied id', () => {
    expect(resolveRequestId({ 'x-request-id': 'abc-123.def' })).toBe(
      'abc-123.def',
    );
  });

  it.each([
    ['too long', 'a'.repeat(129)],
    ['carrying markup', '<script>alert(1)</script>'],
    ['empty', ''],
  ])('replaces an id that is %s', (_label, supplied) => {
    expect(resolveRequestId({ 'x-request-id': supplied })).toMatch(
      /^[\da-f-]{36}$/,
    );
  });
});

describe('resolveServiceIdentity', () => {
  it('reads deployment facts from the environment', () => {
    expect(
      resolveServiceIdentity('api', {
        AWS_REGION: 'eu-west-1',
        DEPLOYMENT_ID: 'd-42',
        NODE_ENV: 'production',
        npm_package_version: '1.2.3',
      }),
    ).toEqual({
      deployment_id: 'd-42',
      environment: 'production',
      region: 'eu-west-1',
      service: 'api',
      version: '1.2.3',
    });
  });
});
