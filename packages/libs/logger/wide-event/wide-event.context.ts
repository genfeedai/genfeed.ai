import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  WideEventError,
  WideEventOutcome,
  WideEventRecord,
} from './wide-event.interface';

const storage = new AsyncLocalStorage<WideEventRecord>();

const MAX_STACK_LENGTH = 4_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Runs `work` with `event` as the current unit of work's wide event. */
export function runWithWideEvent<T>(event: WideEventRecord, work: () => T): T {
  return storage.run(event, work);
}

/** The wide event of the current request or job, or undefined outside one. */
export function getWideEvent(): WideEventRecord | undefined {
  return storage.getStore();
}

/**
 * Merges fields into an event. Plain-object values merge one level deep so
 * `enrichWideEvent({ user: { id } })` and a later `{ user: { tier } }` both
 * land on `user`; `undefined` never overwrites a value.
 */
export function mergeWideEventFields(
  event: WideEventRecord,
  fields: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (!isPlainObject(value)) {
      event[key] = value;
      continue;
    }

    const defined = stripUndefined(value);
    if (Object.keys(defined).length === 0) continue;
    const current = event[key];
    event[key] = isPlainObject(current) ? { ...current, ...defined } : defined;
  }
}

function stripUndefined(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

/**
 * Adds business context to the current wide event. Call it where the context
 * becomes known (after loading the brand, after choosing a model) instead of
 * logging a line there. A no-op outside a request or job.
 */
export function enrichWideEvent(fields: Record<string, unknown>): void {
  const event = storage.getStore();
  if (event) mergeWideEventFields(event, fields);
}

interface ErrorLike {
  code?: unknown;
  message: string;
  name?: unknown;
  retriable?: unknown;
  stack?: unknown;
  status?: unknown;
}

function isErrorLike(value: unknown): value is ErrorLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

/** Reads Errors and error-shaped objects (driver errors, rejected payloads). */
export function toWideEventError(error: unknown): WideEventError {
  if (isErrorLike(error)) {
    return {
      code:
        typeof error.code === 'string' || typeof error.code === 'number'
          ? String(error.code)
          : undefined,
      message: error.message,
      retriable:
        typeof error.retriable === 'boolean' ? error.retriable : undefined,
      stack:
        typeof error.stack === 'string'
          ? error.stack.slice(0, MAX_STACK_LENGTH)
          : undefined,
      status: typeof error.status === 'number' ? error.status : undefined,
      type: typeof error.name === 'string' ? error.name : 'Error',
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
    type: 'NonError',
  };
}

/** Attaches a failure to the current wide event; the first failure wins. */
export function recordWideEventError(
  error: unknown,
  fields?: Partial<WideEventError>,
): void {
  const event = storage.getStore();
  if (!event || event.error) return;
  event.error = { ...toWideEventError(error), ...fields };
}

/**
 * The status code decides: a recorded error behind a 404 is still the caller's
 * mistake. An error with no failing status (a job, or a handled exception) is
 * ours.
 */
export function readWideEventOutcome(
  statusCode: number | undefined,
  hasError: boolean,
): WideEventOutcome {
  if (statusCode !== undefined && statusCode >= 500) return 'error';
  if (statusCode !== undefined && statusCode >= 400) return 'client_error';
  return hasError ? 'error' : 'success';
}
