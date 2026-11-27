/**
 * A short-lived answer that concurrent callers share. A lookup that is already
 * in flight for a key is awaited by the next caller instead of repeated, and a
 * successful answer is kept for `ttlMs`. A failure is never kept: the next call
 * asks again, so a fix takes effect at once.
 *
 * It exists because the MCP server answers one tool call with several reads of
 * the same account data, and a client that fires five calls at once used to make
 * five of each (#11452).
 */
export class SharedLookup<T> {
  private readonly answers = new Map<string, { expiresAt: number; value: T }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const answer = this.answers.get(key);
    if (answer) {
      if (answer.expiresAt > this.now()) return Promise.resolve(answer.value);
      this.answers.delete(key);
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const started = load().then((value) => {
      this.remember(key, value);
      return value;
    });
    const settled = started.finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, settled);
    return settled;
  }

  private remember(key: string, value: T): void {
    if (this.answers.size >= this.maxEntries) {
      const oldest = this.answers.keys().next().value;
      if (oldest !== undefined) this.answers.delete(oldest);
    }
    this.answers.set(key, { expiresAt: this.now() + this.ttlMs, value });
  }
}
