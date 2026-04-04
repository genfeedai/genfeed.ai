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
