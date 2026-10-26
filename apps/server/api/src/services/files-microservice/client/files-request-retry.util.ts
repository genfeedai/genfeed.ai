import type { AxiosResponse } from 'axios';
import { firstValueFrom, type Observable } from 'rxjs';

/**
 * Which failures of a files-service request may be retried.
 *
 * - `NONE`: never retry.
 * - `PRE_SEND`: retry only when the request provably never reached the
 *   server (DNS failure, refused connection). Safe for every call with a
 *   replayable body.
 * - `IDEMPOTENT`: additionally retry mid-flight resets and timeouts. Only for
 *   an explicit allowlist of read-only or naturally idempotent calls.
 */
export enum FilesRetryPolicy {
  NONE = 'none',
  PRE_SEND = 'pre-send',
  IDEMPOTENT = 'idempotent',
}

/** Explicit per-call timeouts; no call relies on the module default. */
export const FILES_REQUEST_TIMEOUT_MS = {
  /** Presign, exists, delete, job status, stats. */
  QUICK: 15_000,
  /** Enqueue a job, probe remote metadata. */
  STANDARD: 30_000,
  /** Time to first byte for a streamed download. */
  DOWNLOAD: 60_000,
  /** Single-pass image work and storage copies. */
  PROCESSING: 2 * 60_000,
  /** Audio mixing and video QA over a full asset. */
  HEAVY_PROCESSING: 5 * 60_000,
  /** Uploading media bytes. */
  UPLOAD: 5 * 60_000,
} as const;

export const FILES_REQUEST_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 250;

/** The request never left this host, so it cannot have been processed. */
const PRE_SEND_ERROR_CODES: ReadonlySet<string> = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
]);

/** The server may or may not have processed the request. */
const MID_FLIGHT_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'ECONNABORTED',
  'UND_ERR_SOCKET',
]);

type FilesRequestLogger = {
  warn: (message: string, context?: unknown) => void;
};

export type FilesRequestOptions = {
  /** Short name used in retry logs. */
  operation: string;
  retryPolicy?: FilesRetryPolicy;
  /** A one-shot stream body cannot be replayed, so it disables all retries. */
  hasStreamBody?: boolean;
  logger?: FilesRequestLogger;
  baseDelayMs?: number;
};

type ErrorLike = {
  cause?: { code?: unknown };
  code?: unknown;
  message?: unknown;
  response?: unknown;
};

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const { cause, code, message } = error as ErrorLike;
  if (typeof code === 'string') {
    return code;
  }
  if (typeof cause?.code === 'string') {
    return cause.code;
  }
  return typeof message === 'string' && message.includes('socket hang up')
    ? 'ECONNRESET'
    : undefined;
}

export function isRetryableFilesError(
  error: unknown,
  retryPolicy: FilesRetryPolicy,
  hasStreamBody = false,
): boolean {
  if (retryPolicy === FilesRetryPolicy.NONE || hasStreamBody) {
    return false;
  }
  // An HTTP status means the server answered; never repeat the call.
  if ((error as ErrorLike | null)?.response) {
    return false;
  }
  const code = readErrorCode(error);
  if (!code) {
    return false;
  }
  if (PRE_SEND_ERROR_CODES.has(code)) {
    return true;
  }
  return (
    retryPolicy === FilesRetryPolicy.IDEMPOTENT &&
    MID_FLIGHT_ERROR_CODES.has(code)
  );
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Send one files-service request, retrying transient network failures per the
 * call's retry policy. `execute` must build a fresh request each time it runs.
 */
export async function sendFilesRequest<T>(
  execute: () => Observable<AxiosResponse<T>>,
  options: FilesRequestOptions,
): Promise<AxiosResponse<T>> {
  const retryPolicy = options.retryPolicy ?? FilesRetryPolicy.PRE_SEND;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await firstValueFrom(execute());
    } catch (error: unknown) {
      if (
        attempt >= FILES_REQUEST_MAX_RETRIES ||
        !isRetryableFilesError(error, retryPolicy, options.hasStreamBody)
      ) {
        throw error;
      }

      options.logger?.warn(
        `Retrying files service request: ${options.operation}`,
        { attempt: attempt + 1, code: readErrorCode(error) },
      );
      // Exponential backoff with 50-100% jitter.
      await wait(baseDelayMs * 2 ** attempt * (0.5 + Math.random() / 2));
    }
  }
}
