import { performance } from 'node:perf_hooks';
import {
  mergeWideEventFields,
  readWideEventOutcome,
} from './wide-event.context';
import type {
  WideEventRecord,
  WideEventServiceIdentity,
  WideEventTraceContext,
} from './wide-event.interface';
import { shouldKeepWideEvent } from './wide-event.sampling';

export interface WideEventSink {
  wideEvent(event: WideEventRecord): void;
}

export interface StartedWideEvent {
  event: WideEventRecord;
  startedAt: number;
}

interface StartWideEventOptions {
  identity: WideEventServiceIdentity;
  kind: WideEventRecord['kind'];
  requestId: string;
  trace: WideEventTraceContext;
  fields?: Record<string, unknown>;
}

export function startWideEvent(
  options: StartWideEventOptions,
): StartedWideEvent {
  const event: WideEventRecord = {
    kind: options.kind,
    parent_span_id: options.trace.parentSpanId,
    request_id: options.requestId,
    span_id: options.trace.spanId,
    timestamp: new Date().toISOString(),
    trace_id: options.trace.traceId,
    ...options.identity,
  };
  if (options.fields) mergeWideEventFields(event, options.fields);

  return { event, startedAt: performance.now() };
}

/**
 * Closes a wide event: stamps duration and outcome, applies tail sampling, and
 * emits at most once. Never throws, because logging must not fail the request
 * it describes.
 */
export function finishWideEvent(
  sink: WideEventSink,
  started: StartedWideEvent,
  fields?: Record<string, unknown>,
): void {
  const { event, startedAt } = started;
  try {
    if (fields) mergeWideEventFields(event, fields);
    event.duration_ms = Math.round(performance.now() - startedAt);
    event.outcome = readWideEventOutcome(
      event.status_code,
      event.error !== undefined,
    );

    if (shouldKeepWideEvent(event)) sink.wideEvent(event);
  } catch {
    // Dropping one event is better than failing the request it describes.
  }
}
