import type {
  IIngredient,
  MediaDeliveryGrant,
} from '@genfeedai/contracts/interfaces';

/**
 * `POST /ingredients/media-previews` is rate limited per user, and a grid of
 * pending tiles polls on its own timers. Ask the API to prepare an ingredient
 * once per window; the poll itself only reads.
 */
const PREPARE_COOLDOWN_MS = 60_000;

/** Coalesces browser preview refreshes. Durable rendering lives on the server. */
export class MediaPreviewBatchService {
  private readonly preparedAt = new Map<string, number>();
  /** Ids a person asked to retry; a failed preview is prepared again only for these. */
  private readonly retryIds = new Set<string>();
  private pending = new Map<
    string,
    Array<(grant: MediaDeliveryGrant | null) => void>
  >();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly read: (ids: string[]) => Promise<IIngredient[]>,
    private readonly prepare: (ids: string[]) => Promise<void>,
  ) {}

  request(
    id: string,
    signal: AbortSignal,
    options: { isRetry?: boolean } = {},
  ): Promise<MediaDeliveryGrant | null> {
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
      if (options.isRetry) this.retryIds.add(id);
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
        const now = Date.now();
        const toPrepare = ingredients
          .filter((ingredient) => {
            const state = ingredient.mediaDelivery?.state;
            // A failed preview never comes back on its own: only an explicit
            // retry asks the API to render it again.
            if (state === 'FAILED') return this.retryIds.has(ingredient.id);
            return (
              state === 'PENDING' &&
              now - (this.preparedAt.get(ingredient.id) ?? -Infinity) >=
                PREPARE_COOLDOWN_MS
            );
          })
          .map((ingredient) => ingredient.id);
        for (const id of ids) this.retryIds.delete(id);
        if (toPrepare.length) {
          for (const preparedId of toPrepare)
            this.preparedAt.set(preparedId, now);
          // Preparation is a nudge. If it is refused or rate limited, the
          // grants just read are still valid, so they must still reach the tiles.
          await this.prepare(toPrepare).catch(() => undefined);
        }
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
