import { isActionContractFailureMessage } from '@genfeedai/workflows/engine';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { isRecord } from '@workers/services/provider-contract.util';
import { UnrecoverableError } from 'bullmq';

/**
 * A `system-run` job is retried only when its failure looks transient. This is
 * an allowlist on purpose: node errors reach the processor flattened into a
 * string, so an unrecognised failure is safer to surface once than to repeat
 * three times on a shared, rate-limited queue (#5633).
 */
const TRANSIENT_ERROR_PATTERNS = [
  'rate limit',
  'too many requests',
  'timeout',
  'timed out',
  'etimedout',
  'econnreset',
  'econnrefused',
  'econnaborted',
  'epipe',
  'eai_again',
  'enotfound',
  'socket hang up',
  'fetch failed',
  'service unavailable',
  'bad gateway',
  'temporarily unavailable',
  'deadlock',
  'write conflict',
  'connection terminated',
  'connection closed',
  'connection lost',
] as const;

const TRANSIENT_HTTP_STATUS = /\b(?:429|500|502|503|504)\b/;

/** Prisma connection, pool-timeout and write-conflict codes. */
const TRANSIENT_PRISMA_CODE = /\bP(?:1001|1002|1008|1017|2024|2034)\b/;

export function isRetryableSystemRunError(error: unknown): boolean {
  if (error instanceof UnrecoverableError) {
    return false;
  }
  const message = getErrorMessage(error);
  // Deterministic: the same graph and input fail identically on every retry,
  // even when the message happens to contain a transient-looking word.
  if (isActionContractFailureMessage(message)) {
    return false;
  }
  if (isRecord(error) && typeof error.isRetryable === 'boolean') {
    return error.isRetryable;
  }

  const code =
    isRecord(error) && 'code' in error ? String(error.code ?? '') : '';
  const text = `${code} ${message}`;
  const normalized = text.toLowerCase();

  return (
    TRANSIENT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern)) ||
    TRANSIENT_HTTP_STATUS.test(text) ||
    TRANSIENT_PRISMA_CODE.test(text)
  );
}

/** Wraps a non-retryable failure so BullMQ fails the job without another attempt. */
export function toTerminalSystemRunError(error: unknown): UnrecoverableError {
  if (error instanceof UnrecoverableError) {
    return error;
  }
  const terminal = new UnrecoverableError(getErrorMessage(error));
  if (error instanceof Error) {
    terminal.stack = error.stack;
    terminal.cause = error;
  }
  return terminal;
}
