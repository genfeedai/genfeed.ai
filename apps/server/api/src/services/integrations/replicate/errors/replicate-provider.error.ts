import { AgentFailureReason } from '@genfeedai/contracts';

/**
 * Typed, non-generic failure raised when Replicate's API rejects a request
 * with a well-known HTTP status (e.g. 402 insufficient credit). Callers use
 * `reason`/`isRetryable` to classify the failure instead of pattern-matching
 * on the raw error message.
 */
export class ReplicateProviderError extends Error {
  readonly reason: AgentFailureReason;
  readonly isRetryable: boolean;
  readonly statusCode?: number;

  constructor(
    reason: AgentFailureReason,
    message: string,
    options: { isRetryable: boolean; statusCode?: number },
  ) {
    super(message);
    this.name = ReplicateProviderError.name;
    this.reason = reason;
    this.isRetryable = options.isRetryable;
    this.statusCode = options.statusCode;
  }
}

function readStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const status = (
    error as { status?: unknown; response?: { status?: unknown } }
  ).status;
  if (typeof status === 'number') {
    return status;
  }

  const response = (error as { response?: { status?: unknown } }).response;
  if (response && typeof response === 'object' && 'status' in response) {
    const responseStatus = (response as { status?: unknown }).status;
    return typeof responseStatus === 'number' ? responseStatus : undefined;
  }

  return undefined;
}

/**
 * Maps a raw error thrown by the `replicate` SDK to a typed
 * {@link ReplicateProviderError} when the HTTP status is well-known.
 * Returns the original error unchanged otherwise.
 */
export function toReplicateProviderError(error: unknown): Error {
  if (error instanceof ReplicateProviderError) {
    return error;
  }

  const statusCode = readStatusCode(error);
  if (statusCode === 402) {
    return new ReplicateProviderError(
      AgentFailureReason.INSUFFICIENT_CREDITS,
      'Replicate rejected the request due to insufficient credit.',
      { isRetryable: false, statusCode },
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}
