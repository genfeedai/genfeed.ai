/**
 * Request identity stamped on every span a request emits.
 * Values are opaque ids and plan labels, never names, emails or IPs.
 */
export interface SpanRequestContext {
  brandId?: string;
  isSuperAdmin?: boolean;
  organizationId?: string;
  subscriptionTier?: string;
  userId?: string;
}

/** Any function a span can wrap. */
export type TraceableFunction = (...args: never[]) => unknown;
