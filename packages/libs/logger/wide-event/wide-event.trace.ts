import { randomBytes, randomUUID } from 'node:crypto';
import { getActiveSpan, spanToJSON } from '@sentry/nestjs';
import type {
  WideEventServiceIdentity,
  WideEventTraceContext,
} from './wide-event.interface';

// W3C trace-context: version-traceid-parentid-flags, ids must not be all zero.
const TRACEPARENT_PATTERN =
  /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$/i;
const ALL_ZERO_TRACE_ID = '0'.repeat(32);
const ALL_ZERO_SPAN_ID = '0'.repeat(16);
const REQUEST_ID_PATTERN = /^[\w.:-]{1,128}$/;

export function readHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

const HEX_TRACE_ID = /^[\da-f]{32}$/;
const HEX_SPAN_ID = /^[\da-f]{16}$/;

function readTraceparent(
  headers: Record<string, string | string[] | undefined> | undefined,
):
  | Required<Pick<WideEventTraceContext, 'parentSpanId' | 'traceId'>>
  | undefined {
  const [, traceId, parentSpanId] =
    TRACEPARENT_PATTERN.exec(
      readHeader(headers, 'traceparent')?.trim() ?? '',
    ) ?? [];

  if (
    !traceId ||
    !parentSpanId ||
    traceId === ALL_ZERO_TRACE_ID ||
    parentSpanId === ALL_ZERO_SPAN_ID
  ) {
    return undefined;
  }

  return {
    parentSpanId: parentSpanId.toLowerCase(),
    traceId: traceId.toLowerCase(),
  };
}

/**
 * The single place trace identity is decided. Inside a Sentry span (the
 * request or job span) the wide event takes that span's ids, so it joins the
 * trace in Sentry and matches what outgoing requests propagate. Without one
 * (Sentry off: dev, CI, self-hosted) it continues an incoming `traceparent`,
 * or starts a new trace.
 */
export function resolveTraceContext(
  headers: Record<string, string | string[] | undefined> | undefined,
): WideEventTraceContext {
  const incoming = readTraceparent(headers);
  const activeSpan = getActiveSpan();
  const active = activeSpan?.spanContext();

  if (
    activeSpan &&
    active &&
    HEX_TRACE_ID.test(active.traceId) &&
    active.traceId !== ALL_ZERO_TRACE_ID &&
    HEX_SPAN_ID.test(active.spanId)
  ) {
    const parentSpanId =
      spanToJSON(activeSpan).parent_span_id ??
      (incoming?.traceId === active.traceId
        ? incoming.parentSpanId
        : undefined);

    return {
      ...(parentSpanId ? { parentSpanId } : {}),
      spanId: active.spanId,
      traceId: active.traceId,
    };
  }

  const spanId = randomBytes(8).toString('hex');

  if (incoming) {
    return { ...incoming, spanId };
  }

  return { spanId, traceId: randomBytes(16).toString('hex') };
}

/** Accepts a caller-supplied correlation id only when it is short and boring. */
export function resolveRequestId(
  headers: Record<string, string | string[] | undefined> | undefined,
): string {
  const supplied = readHeader(headers, 'x-request-id')?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
}

export function resolveServiceIdentity(
  service: string,
  env: NodeJS.ProcessEnv = process.env,
): WideEventServiceIdentity {
  return {
    deployment_id: env.DEPLOYMENT_ID || undefined,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || undefined,
    region: env.AWS_REGION || undefined,
    service,
    version: env.npm_package_version || env.VERSION || undefined,
  };
}
