export class PollTimeoutException extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
    this.name = 'PollTimeoutException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown by {@link PollUntilService.poll} when its `AbortSignal` fires — before
 * the next attempt or while waiting between attempts.
 */
export class PollAbortException extends Error {
  constructor(message = 'Poll aborted') {
    super(message);
    this.name = 'PollAbortException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
