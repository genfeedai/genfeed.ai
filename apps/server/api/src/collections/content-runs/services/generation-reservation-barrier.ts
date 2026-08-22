/**
 * Releases provider dispatch only after every requested output has persisted
 * and attached its durable Ingredient placeholder. A preparation failure
 * rejects every waiter so a partial reservation can never start a provider.
 */
export class GenerationReservationBarrier {
  private arrived = 0;
  private readonly promise: Promise<void>;
  private rejectBarrier!: (reason?: unknown) => void;
  private resolveBarrier!: () => void;
  private settled = false;

  constructor(
    private readonly expected: number,
    private readonly beforeRelease?: () => Promise<void>,
  ) {
    this.promise = new Promise<void>((resolve, reject) => {
      this.rejectBarrier = reject;
      this.resolveBarrier = resolve;
    });
  }

  async arrive(): Promise<void> {
    if (this.settled) return this.promise;
    this.arrived += 1;
    if (this.arrived === this.expected) {
      this.settled = true;
      try {
        await this.beforeRelease?.();
        this.resolveBarrier();
      } catch (error: unknown) {
        this.rejectBarrier(error);
      }
    }
    return this.promise;
  }

  fail(error: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.rejectBarrier(error);
  }
}
