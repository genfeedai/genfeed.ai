export abstract class WorkflowExecutionError extends Error {
  abstract readonly isRetryable: boolean;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class TransientExecutionError extends WorkflowExecutionError {
  readonly isRetryable = true;
}

export class PermanentExecutionError extends WorkflowExecutionError {
  readonly isRetryable = false;
}

const RETRYABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function readHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('getStatus' in error && typeof error.getStatus === 'function') {
    const status = error.getStatus();
    if (typeof status === 'number') {
      return status;
    }
  }

  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  return undefined;
}

export function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUS.has(status);
}

export function executionErrorFromHttpStatus(
  status: number,
  message: string,
): WorkflowExecutionError {
  return isRetryableHttpStatus(status)
    ? new TransientExecutionError(message)
    : new PermanentExecutionError(message);
}

export function isTypedRetryableError(error: unknown): boolean {
  if (error instanceof WorkflowExecutionError) {
    return error.isRetryable;
  }

  const status = readHttpStatus(error);
  if (status !== undefined) {
    return isRetryableHttpStatus(status);
  }

  return false;
}
