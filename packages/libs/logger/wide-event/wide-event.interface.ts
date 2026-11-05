/**
 * Wide events: one context-rich, queryable event per unit of work (HTTP request
 * or queue job) per service, emitted once when the work finishes. Handlers add
 * business context as they run via `enrichWideEvent`; nothing is logged per
 * step. See docs/engineering/wide-event-logging.md.
 */

export type WideEventKind = 'http' | 'job';

/** `client_error` is a 4xx the caller caused; `error` is a failure on our side. */
export type WideEventOutcome = 'success' | 'client_error' | 'error';

export interface WideEventError {
  type: string;
  message: string;
  code?: string;
  status?: number;
  retriable?: boolean;
  stack?: string;
}

export interface WideEventJob {
  queue: string;
  name: string;
  id?: string;
  attempt: number;
  max_attempts?: number;
}

export interface WideEvent {
  kind: WideEventKind;
  timestamp: string;
  duration_ms?: number;
  request_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string;

  service: string;
  version?: string;
  environment?: string;
  deployment_id?: string;
  region?: string;

  outcome?: WideEventOutcome;
  method?: string;
  path?: string;
  route?: string;
  status_code?: number;
  user_agent?: string;
  job?: WideEventJob;
  error?: WideEventError;

  /** Tail-sampling decision: `1` for always-kept events, otherwise the sample rate. */
  sample_rate?: number;
}

/**
 * The event plus whatever namespaced buckets handlers attach (`user`,
 * `organization`, `brand`, `database`, `generation`, ...). Buckets are plain
 * objects so fields stay queryable as `bucket.field`.
 */
export type WideEventRecord = WideEvent & Record<string, unknown>;

export interface WideEventServiceIdentity {
  service: string;
  version?: string;
  environment?: string;
  deployment_id?: string;
  region?: string;
}

export interface WideEventTraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}
