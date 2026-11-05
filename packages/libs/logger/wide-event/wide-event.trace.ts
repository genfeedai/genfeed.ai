import { randomBytes, randomUUID } from 'node:crypto';
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

/**
 * Continues an incoming `traceparent` so a wide event shares its trace id with
 * the calling service, or starts a new trace. This is the single place trace
 * identity is decided: when OpenTelemetry tracing is installed, resolve from the
 * active span here so wide events and spans carry the same ids.
 */
export function resolveTraceContext(
  headers: Record<string, string | string[] | undefined> | undefined,
): WideEventTraceContext {
  const spanId = randomBytes(8).toString('hex');
  const [, traceId, parentSpanId] =
    TRACEPARENT_PATTERN.exec(
      readHeader(headers, 'traceparent')?.trim() ?? '',
    ) ?? [];

  if (
    traceId &&
    parentSpanId &&
    traceId !== ALL_ZERO_TRACE_ID &&
    parentSpanId !== ALL_ZERO_SPAN_ID
  ) {
    return {
      parentSpanId: parentSpanId.toLowerCase(),
      spanId,
      traceId: traceId.toLowerCase(),
    };
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
