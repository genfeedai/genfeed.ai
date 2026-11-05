import { subscribe } from 'node:diagnostics_channel';
import { IncomingMessage } from 'node:http';
import type { SpanRequestContext } from '@libs/interfaces/tracing.interface';
import {
  getClient,
  getIsolationScope,
  type Scope,
  type Span,
  spanToJSON,
} from '@sentry/nestjs';

/**
 * Request identity and outcome on every span, and W3C trace context in.
 *
 * Sentry forks one isolation scope per incoming request. The request's
 * identity is recorded against that scope once auth has resolved it
 * (`setSpanRequestContext`), and a client hook copies it onto each span when
 * the span ends. Copying at the end, not the start, is what lets the root
 * `http.server` span and spans opened before auth (the auth guard itself)
 * carry it. A span that already ended before auth resolved (CORS, body
 * parsing) gets only its outcome; it still shares the root's trace and
 * segment ids, which is how a query joins it to the request identity.
 *
 * Sentry continues incoming `sentry-trace` headers natively and sends W3C
 * `traceparent` out when `propagateTraceparent` is set, but it does not read
 * an incoming `traceparent`. `continueIncomingTraceparent` fills that gap.
 */

const ATTRIBUTE_PREFIX = 'genfeed';
const OUTCOME_ATTRIBUTE = `${ATTRIBUTE_PREFIX}.outcome`;
const SUCCESS_STATUSES: ReadonlySet<string> = new Set(['ok']);
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const INVALID_TRACE_ID = '0'.repeat(32);
const INVALID_SPAN_ID = '0'.repeat(16);
const HTTP_SERVER_REQUEST_START = 'http.server.request.start';

type SpanAttributes = Record<string, boolean | string>;

const requestAttributesByScope = new WeakMap<Scope, SpanAttributes>();
const requestScopeBySpan = new WeakMap<Span, Scope>();

function toSpanAttributes(context: SpanRequestContext): SpanAttributes {
  const attributes: SpanAttributes = {};

  if (context.organizationId) {
    attributes[`${ATTRIBUTE_PREFIX}.organization_id`] = context.organizationId;
  }
  if (context.userId) {
    attributes[`${ATTRIBUTE_PREFIX}.user_id`] = context.userId;
  }
  if (context.brandId) {
    attributes[`${ATTRIBUTE_PREFIX}.brand_id`] = context.brandId;
  }
  if (context.subscriptionTier) {
    attributes[`${ATTRIBUTE_PREFIX}.subscription_tier`] =
      context.subscriptionTier;
  }
  if (context.isSuperAdmin !== undefined) {
    attributes[`${ATTRIBUTE_PREFIX}.is_super_admin`] = context.isSuperAdmin;
  }

  return attributes;
}

/** Record the resolved request identity for every span of this request. */
export function setSpanRequestContext(context: SpanRequestContext): void {
  const scope = getIsolationScope();
  requestAttributesByScope.set(scope, {
    ...requestAttributesByScope.get(scope),
    ...toSpanAttributes(context),
  });
}

export function getSpanOutcome(span: Span): 'error' | 'success' {
  const { status } = spanToJSON(span);
  return status === undefined || SUCCESS_STATUSES.has(status)
    ? 'success'
    : 'error';
}

let isSpanRequestContextRegistered = false;

/** Install the span hooks once, after `Sentry.init`. No-op without a client. */
export function registerSpanRequestContext(): void {
  const client = getClient();

  if (!client || isSpanRequestContextRegistered) {
    return;
  }
  isSpanRequestContextRegistered = true;

  client.on('spanStart', (span) => {
    requestScopeBySpan.set(span, getIsolationScope());
  });

  client.on('spanEnd', (span) => {
    const scope = requestScopeBySpan.get(span);
    const attributes = scope ? requestAttributesByScope.get(scope) : undefined;

    if (attributes) {
      span.setAttributes(attributes);
    }
    span.setAttribute(OUTCOME_ATTRIBUTE, getSpanOutcome(span));
  });
}

/**
 * Turn a W3C `traceparent` into the `sentry-trace` form Sentry continues.
 * The sampled flag is dropped on purpose: our own sample rate decides, so an
 * external caller cannot force every request into the span quota.
 */
export function sentryTraceFromTraceparent(
  traceparent: string | undefined,
): string | undefined {
  const match = traceparent?.trim().toLowerCase().match(TRACEPARENT_PATTERN);

  if (!match) {
    return undefined;
  }

  const [, traceId, parentSpanId] = match;
  if (traceId === INVALID_TRACE_ID || parentSpanId === INVALID_SPAN_ID) {
    return undefined;
  }

  return `${traceId}-${parentSpanId}`;
}

/**
 * Continue an incoming W3C trace when no `sentry-trace` header is present.
 * Node publishes this channel before the server emits `request`, which is
 * where Sentry reads the trace headers.
 */
export function applyIncomingTraceparent(request: IncomingMessage): void {
  if (request.headers['sentry-trace']) {
    return;
  }

  const traceparent = request.headers.traceparent;
  const sentryTrace = sentryTraceFromTraceparent(
    Array.isArray(traceparent) ? traceparent[0] : traceparent,
  );

  if (sentryTrace) {
    request.headers['sentry-trace'] = sentryTrace;
  }
}

let isTraceparentSubscribed = false;

export function continueIncomingTraceparent(): void {
  if (isTraceparentSubscribed) {
    return;
  }
  isTraceparentSubscribed = true;

  subscribe(HTTP_SERVER_REQUEST_START, (message) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'request' in message &&
      message.request instanceof IncomingMessage
    ) {
      applyIncomingTraceparent(message.request);
    }
  });
}
