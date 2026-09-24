type ProvisionalEvent = {
  event: string;
  payload: unknown;
  sequence: number;
};
type Bucket = {
  threadId: string;
  runId: string | undefined;
  events: ProvisionalEvent[];
  bytes: number;
  overflow: boolean;
  touchedAt: number;
};
// Only unclaimed buckets expire or count toward this cache bound.
const MAX_UNCLAIMED_BUCKETS = 50;
const MAX_EVENTS = 2048;
const MAX_BYTES = 1_048_576;
const TTL_MS = 300_000;
const keyFor = (threadId: string, runId?: string) =>
  JSON.stringify([threadId, runId ?? null]);

/** Shared raw pre-ACK events; callbacks and entry ownership stay in the registry. */
export function createProvisionalEventPool() {
  const buckets = new Map<string, Bucket>();
  const tombstones = new Map<string, number>();
  let sequence = 0;
  let lossEpoch = -1;

  const recordLoss = (key: string, epoch: number) => {
    tombstones.delete(key);
    tombstones.set(key, Date.now());
    while (tombstones.size > MAX_UNCLAIMED_BUCKETS) {
      const oldest = tombstones.keys().next().value;
      if (oldest === undefined) break;
      tombstones.delete(oldest);
      lossEpoch = Math.max(lossEpoch, epoch);
    }
  };
  const prune = (protectedKeys: Set<string>, epoch: number) => {
    const now = Date.now();
    for (const [key, time] of tombstones) {
      if (now - time <= TTL_MS) continue;
      tombstones.delete(key);
      lossEpoch = Math.max(lossEpoch, epoch);
    }
    for (const [key, bucket] of buckets) {
      if (protectedKeys.has(key) || now - bucket.touchedAt <= TTL_MS) continue;
      buckets.delete(key);
      recordLoss(key, epoch);
    }
    const unclaimed = [...buckets.keys()].filter(
      (key) => !protectedKeys.has(key),
    );
    for (const key of unclaimed.slice(
      0,
      Math.max(0, unclaimed.length - MAX_UNCLAIMED_BUCKETS),
    )) {
      buckets.delete(key);
      recordLoss(key, epoch);
    }
  };

  return {
    keyFor,
    prune,
    add(
      event: string,
      payload: unknown,
      protectedKeys: Set<string>,
      epoch: number,
    ) {
      const { threadId, runId } = payload as {
        threadId?: string;
        runId?: string;
      };
      if (!threadId) return;
      prune(protectedKeys, epoch);
      const key = keyFor(threadId, runId);
      let bucket = buckets.get(key);
      if (!bucket) {
        while (
          !protectedKeys.has(key) &&
          [...buckets.keys()].filter(
            (candidate) => !protectedKeys.has(candidate),
          ).length >= MAX_UNCLAIMED_BUCKETS
        ) {
          const oldest = [...buckets.keys()].find(
            (candidate) => !protectedKeys.has(candidate),
          );
          if (oldest === undefined) break;
          buckets.delete(oldest);
          recordLoss(oldest, epoch);
        }
        bucket = {
          threadId,
          runId,
          events: [],
          bytes: 0,
          overflow: tombstones.has(key),
          touchedAt: Date.now(),
        };
        buckets.set(key, bucket);
      }
      bucket.touchedAt = Date.now();
      if (bucket.overflow) return;
      const bytes = new TextEncoder().encode(
        JSON.stringify(payload),
      ).byteLength;
      if (
        bucket.events.length >= MAX_EVENTS ||
        bucket.bytes + bytes > MAX_BYTES
      ) {
        bucket.events = [];
        bucket.bytes = 0;
        bucket.overflow = true;
        return;
      }
      bucket.bytes += bytes;
      bucket.events.push({ event, payload, sequence: ++sequence });
    },
    hasProgress(threadId: string, runId: string) {
      return [keyFor(threadId, runId), keyFor(threadId)].some((key) => {
        const bucket = buckets.get(key);
        return Boolean(bucket && (bucket.overflow || bucket.events.length));
      });
    },
    claim(
      threadId: string,
      runId: string,
      createdAt: number,
      protectedKeys: Set<string>,
      epoch: number,
    ) {
      prune(protectedKeys, epoch);
      const keys = [keyFor(threadId, runId), keyFor(threadId)];
      const found = keys.flatMap((key) => {
        const bucket = buckets.get(key);
        return bucket ? [bucket] : [];
      });
      const events = found
        .flatMap((bucket) => bucket.events)
        .sort((a, b) => a.sequence - b.sequence);
      const reconcile =
        found.some((bucket) => bucket.overflow) ||
        keys.some((key) => tombstones.has(key)) ||
        (!found.length && createdAt <= lossEpoch) ||
        events.length > MAX_EVENTS ||
        found.reduce((bytes, bucket) => bytes + bucket.bytes, 0) > MAX_BYTES;
      for (const key of keys) {
        buckets.delete(key);
        tombstones.delete(key);
      }
      return { events: reconcile ? [] : events, reconcile };
    },
    reset() {
      buckets.clear();
      tombstones.clear();
      sequence = 0;
      lossEpoch = -1;
    },
  };
}
