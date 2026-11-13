const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/gi;
const NUMBER_PATTERN = /\d+/g;

/** Nest's own handler logs uncaught exceptions; the Sentry filter already reports them. */
const SENTRY_HANDLED_SERVICES = new Set(['ExceptionsHandler']);

/** A repeat of the same message inside this window adds no new information. */
export const SENTRY_REPORT_THROTTLE_MS = 5 * 60 * 1000;
const MAX_TRACKED_FINGERPRINTS = 500;

export interface LoggedErrorReportInput {
  /** Redacted log context (service, operation, caller fields). */
  context?: Record<string, unknown>;
  /** Redacted, serialised error that the log line carries. */
  errorData?: unknown;
  message: string;
  trace?: unknown;
}

export interface LoggedErrorReport {
  error: Error;
  extra: Record<string, unknown>;
  fingerprint: string[];
  tags: Record<string, string>;
}

/** Collapses ids and counts so one failing call site groups into one Sentry issue. */
export function normalizeErrorMessageForFingerprint(message: string): string {
  return message
    .replace(UUID_PATTERN, '<id>')
    .replace(OBJECT_ID_PATTERN, '<id>')
    .replace(NUMBER_PATTERN, '<n>')
    .slice(0, 200);
}

function readHttpStatus(trace: unknown): number | null {
  if (
    trace &&
    typeof trace === 'object' &&
    'getStatus' in trace &&
    typeof (trace as { getStatus: unknown }).getStatus === 'function'
  ) {
    const status = (trace as { getStatus: () => unknown }).getStatus();
    return typeof status === 'number' ? status : null;
  }
  return null;
}

function readString(
  record: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Decides whether a `LoggerService.error` call is a server fault worth a Sentry
 * event and shapes it. Expected client errors (HTTP 4xx) and errors Nest's
 * exception handler already hands to Sentry are not reported.
 */
export function buildLoggedErrorReport(
  input: LoggedErrorReportInput,
): LoggedErrorReport | null {
  const service = readString(input.context, 'service');
  if (service && SENTRY_HANDLED_SERVICES.has(service)) return null;

  const status = readHttpStatus(input.trace);
  if (status !== null && status < 500) return null;

  const error =
    input.trace instanceof Error ? input.trace : new Error(input.message);
  const operation = readString(input.context, 'operation');
  const tags: Record<string, string> = { source: 'logger.error' };
  if (service) tags.service = service;
  if (operation) tags.operation = operation;

  return {
    error,
    extra: {
      ...input.context,
      loggedMessage: input.message,
      ...(input.errorData !== undefined && { loggedError: input.errorData }),
    },
    fingerprint: [
      'logger.error',
      normalizeErrorMessageForFingerprint(input.message),
    ],
    tags,
  };
}

/** Per-process limiter so a burst of one message becomes one event per window. */
export class SentryReportThrottle {
  private readonly lastSentAt = new Map<string, number>();

  constructor(private readonly windowMs = SENTRY_REPORT_THROTTLE_MS) {}

  shouldReport(fingerprint: string[], nowMs: number): boolean {
    const key = fingerprint.join('\u0000');
    const last = this.lastSentAt.get(key);
    if (last !== undefined && nowMs - last < this.windowMs) return false;
    if (this.lastSentAt.size >= MAX_TRACKED_FINGERPRINTS) {
      this.lastSentAt.clear();
    }
    this.lastSentAt.set(key, nowMs);
    return true;
  }
}
