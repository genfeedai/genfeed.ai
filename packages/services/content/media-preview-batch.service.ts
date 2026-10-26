import type {
  IIngredient,
  MediaDeliveryGrant,
} from '@genfeedai/contracts/interfaces';

/** Coalesces browser preview refreshes into one read of up to 50 ingredients. */
export class MediaPreviewBatchService {
  private pending = new Map<
    string,
    Array<(grant: MediaDeliveryGrant | null) => void>
  >();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly read: (ids: string[]) => Promise<IIngredient[]>,
  ) {}

  request(id: string, signal: AbortSignal): Promise<MediaDeliveryGrant | null> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve(null);
        return;
      }
      const onAbort = () => resolve(null);
      signal.addEventListener('abort', onAbort, { once: true });
      const accept = (grant: MediaDeliveryGrant | null) => {
        signal.removeEventListener('abort', onAbort);
        resolve(signal.aborted ? null : grant);
      };
      this.pending.set(id, [...(this.pending.get(id) ?? []), accept]);
      this.flushTimer ??= setTimeout(() => void this.flush(), 25);
    });
  }

  private async flush(): Promise<void> {
    this.flushTimer = undefined;
    const pending = this.pending;
    this.pending = new Map();
    const allIds = [...pending.keys()];
    for (let start = 0; start < allIds.length; start += 50) {
      const ids = allIds.slice(start, start + 50);
      try {
        const ingredients = await this.read(ids);
        const grants = new Map(
          ingredients.map((ingredient) => [
            ingredient.id,
            ingredient.mediaDelivery ?? null,
          ]),
        );
        for (const id of ids) {
          for (const accept of pending.get(id) ?? [])
            accept(grants.get(id) ?? null);
        }
      } catch {
        for (const id of ids) {
          for (const accept of pending.get(id) ?? []) accept(null);
        }
      }
    }
  }
}
