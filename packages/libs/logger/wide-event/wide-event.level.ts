import type { WideEventRecord } from './wide-event.interface';
import { WIDE_EVENT_SLOW_MS } from './wide-event.sampling';

/** Marks a log record as a wide event so formatters can render it as JSON. */
export const WIDE_EVENT_TYPE = 'wide_event';

export type WideEventLogLevel = 'error' | 'warn' | 'info';

export function isWideEventInfo(
  info: Record<string | symbol, unknown>,
): boolean {
  return info.type === WIDE_EVENT_TYPE;
}

export function readWideEventLevel(event: WideEventRecord): WideEventLogLevel {
  if (event.outcome === 'error') return 'error';
  if (
    event.status_code === 401 ||
    event.status_code === 403 ||
    (event.kind === 'http' && (event.duration_ms ?? 0) > WIDE_EVENT_SLOW_MS)
  ) {
    return 'warn';
  }
  return 'info';
}

/** Human-readable message for dev consoles; the fields are the real payload. */
export function summarizeWideEvent(event: WideEventRecord): string {
  const duration = `${event.duration_ms ?? 0}ms`;
  if (event.kind === 'job') {
    return `${event.job?.queue ?? 'job'}:${event.job?.name ?? ''} ${event.outcome ?? ''} ${duration}`.trim();
  }
  return `${event.method ?? ''} ${event.route ?? event.path ?? ''} ${event.status_code ?? ''} ${duration}`.trim();
}
