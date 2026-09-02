import { TargetExecutionState } from '@genfeedai/contracts';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { resolveAccountLabel } from './account-label.util';

const NEAR_WINDOW_MS = 3 * 60 * 60 * 1000;
const QUEUE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type Next24hQueueBucket = 'near' | 'later';

export interface Next24hQueueItem {
  accountLabel: string;
  href: string;
  platform: string;
  releaseId: string;
  scheduledAt: string;
  targetId: string;
  title: string;
}

export interface Next24hQueueGroup {
  bucket: Next24hQueueBucket;
  items: Next24hQueueItem[];
}

/**
 * Buckets every SCHEDULED channel target whose desired publish time falls in
 * `[now, now + 24h]` into "near" (next 3 hours) and "later" (the rest of the
 * window), sorted earliest-first within each bucket. A target with no
 * `scheduledAt` of its own falls back to the release's `scheduledAt`; a
 * target with neither is not schedulable and is excluded.
 */
export function buildNext24hQueue(
  releases: IReleaseGroup[],
  now: Date,
): Next24hQueueGroup[] {
  const windowStart = now.getTime();
  const windowEnd = windowStart + QUEUE_WINDOW_MS;
  const nearCutoff = windowStart + NEAR_WINDOW_MS;

  const items: Next24hQueueItem[] = [];

  for (const release of releases) {
    for (const target of release.targets ?? []) {
      if (target.executionState !== TargetExecutionState.SCHEDULED) {
        continue;
      }

      const scheduledAt = target.scheduledAt ?? release.scheduledAt;
      if (!scheduledAt) {
        continue;
      }

      const scheduledAtMs = new Date(scheduledAt).getTime();
      if (
        Number.isNaN(scheduledAtMs) ||
        scheduledAtMs < windowStart ||
        scheduledAtMs > windowEnd
      ) {
        continue;
      }

      items.push({
        accountLabel: resolveAccountLabel(target.credential, target.platform),
        href: getPublishingPostHref(release.id),
        platform: target.platform,
        releaseId: release.id,
        scheduledAt,
        targetId: target.id,
        title: release.title,
      });
    }
  }

  items.sort(
    (left, right) =>
      new Date(left.scheduledAt).getTime() -
      new Date(right.scheduledAt).getTime(),
  );

  const near = items.filter(
    (item) => new Date(item.scheduledAt).getTime() <= nearCutoff,
  );
  const later = items.filter(
    (item) => new Date(item.scheduledAt).getTime() > nearCutoff,
  );

  const groups: Next24hQueueGroup[] = [];
  if (near.length > 0) {
    groups.push({ bucket: 'near', items: near });
  }
  if (later.length > 0) {
    groups.push({ bucket: 'later', items: later });
  }

  return groups;
}
