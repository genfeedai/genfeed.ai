import type {
  SourceCollectorFailure,
  SourceCollectorFailureReason,
} from '@api/services/source-collector/source-collector.types';
import { getErrorStatus } from '@genfeedai/utils/error/json-api-status.util';
import { HttpException, HttpStatus } from '@nestjs/common';

const ACCESS_REASONS: ReadonlySet<SourceCollectorFailureReason> = new Set([
  'forbidden',
  'payment_required',
  'rate_limited',
  'unauthorized',
]);

const REASON_BY_STATUS: Readonly<Record<number, SourceCollectorFailureReason>> =
  {
    401: 'unauthorized',
    402: 'payment_required',
    403: 'forbidden',
    404: 'not_found',
    429: 'rate_limited',
  };

const REASON_LABEL: Readonly<Record<SourceCollectorFailureReason, string>> = {
  error: 'failed',
  forbidden: 'access forbidden',
  not_found: 'not found',
  payment_required: 'quota or plan exhausted',
  rate_limited: 'rate limited',
  unauthorized: 'not authorized',
  unavailable: 'unavailable',
};

/** Upstream HTTP status, including `twitter-api-v2` errors that use `code`. */
function readUpstreamStatus(error: unknown): number | undefined {
  const status = getErrorStatus(error);
  if (status !== undefined) {
    return status;
  }
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const { code, response } = error as {
    code?: unknown;
    response?: { statusCode?: unknown };
  };
  for (const candidate of [code, response?.statusCode]) {
    if (
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= 400 &&
      candidate < 600
    ) {
      return candidate;
    }
  }
  return undefined;
}

function reasonFromMessage(message: string): SourceCollectorFailureReason {
  if (/not found|deleted|private|incomplete/i.test(message)) {
    return 'not_found';
  }
  if (/unauthori[sz]ed|invalid token|token expired|no .*token/i.test(message)) {
    return 'unauthorized';
  }
  if (/forbidden|access[- ]denied|permission/i.test(message)) {
    return 'forbidden';
  }
  if (/quota|credits? exhausted|payment required|usage cap/i.test(message)) {
    return 'payment_required';
  }
  if (/rate[- ]limit|too many requests/i.test(message)) {
    return 'rate_limited';
  }
  return 'error';
}

/** Classify one provider failure by status, falling back to its message. */
export function classifySourceCollectorFailure(
  provider: SourceCollectorFailure['provider'],
  error: unknown,
): SourceCollectorFailure {
  const status = readUpstreamStatus(error);
  const byStatus =
    status === undefined
      ? undefined
      : (REASON_BY_STATUS[status] ??
        (status >= 500 ? 'unavailable' : undefined));
  const message = error instanceof Error ? error.message : String(error ?? '');
  return {
    provider,
    reason: byStatus ?? reasonFromMessage(message),
    ...(status === undefined ? {} : { status }),
  };
}

function describeFailure(failure: SourceCollectorFailure): string {
  const status = failure.status ? ` (${failure.status})` : '';
  return `${failure.provider}: ${REASON_LABEL[failure.reason]}${status}`;
}

/**
 * Every collector in the chain failed. The message names each provider's
 * failure class and upstream status only — never provider response bodies.
 * When every failure is an access class the request is unactionable server
 * side (reconnect, top up, or wait), so it is a 424 rather than a 5xx.
 */
export class SourceCollectionFailedException extends HttpException {
  readonly failures: readonly SourceCollectorFailure[];

  constructor(subject: string, failures: readonly SourceCollectorFailure[]) {
    // No attempt at all means no collector is connected or configured.
    const isAccessOnly = failures.every((failure) =>
      ACCESS_REASONS.has(failure.reason),
    );
    const isNotFound =
      failures.length > 0 &&
      failures.every((failure) => failure.reason === 'not_found');
    const summary =
      failures.length > 0
        ? failures.map(describeFailure).join(' | ')
        : 'no collector is connected or configured';
    const detail = `${subject}: ${summary}`;
    const status = isAccessOnly
      ? HttpStatus.FAILED_DEPENDENCY
      : isNotFound
        ? HttpStatus.NOT_FOUND
        : HttpStatus.BAD_GATEWAY;
    super(
      {
        detail,
        failures: failures.map((failure) => ({ ...failure })),
        title: 'Source collection failed',
      },
      status,
    );
    this.message = detail;
    this.name = 'SourceCollectionFailedException';
    this.failures = failures;
  }
}
