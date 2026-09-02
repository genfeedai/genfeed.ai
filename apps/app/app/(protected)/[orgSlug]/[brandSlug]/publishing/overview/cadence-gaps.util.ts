import { TargetExecutionState } from '@genfeedai/enums';
import type {
  AccountHealthSummary,
  IReleaseGroup,
} from '@genfeedai/interfaces';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CadenceGap {
  accountLabel: string;
  credentialId: string;
  gapDays: number | null;
  hasUpcoming: boolean;
  holdPublishing: boolean;
  lastPublishedAt: string | null;
  needsReconnect: boolean;
  platform: string;
}

export interface CadenceGapsInput {
  accountHealth: AccountHealthSummary[];
  postedReleases: IReleaseGroup[];
  upcomingReleases: IReleaseGroup[];
}

/**
 * For every connected account, how long since it last published and whether
 * it has anything scheduled — so a silent account is visible instead of
 * absent. Derived only from data the app already fetches: account health for
 * the account roster, published releases for the last-publish timestamp, and
 * scheduled releases for "has anything queued." No engagement or performance
 * analytics are inferred.
 */
export function buildCadenceGaps(
  { accountHealth, postedReleases, upcomingReleases }: CadenceGapsInput,
  now: Date,
): CadenceGap[] {
  const lastPublishedByCredential = new Map<string, string>();
  for (const release of postedReleases) {
    for (const target of release.targets ?? []) {
      if (target.executionState !== TargetExecutionState.PUBLISHED) {
        continue;
      }
      const publishedAt = target.publishedAt ?? release.publishedAt;
      if (!publishedAt) {
        continue;
      }
      const current = lastPublishedByCredential.get(target.credentialId);
      if (!current || new Date(publishedAt) > new Date(current)) {
        lastPublishedByCredential.set(target.credentialId, publishedAt);
      }
    }
  }

  const upcomingCredentialIds = new Set<string>();
  for (const release of upcomingReleases) {
    for (const target of release.targets ?? []) {
      if (target.executionState === TargetExecutionState.SCHEDULED) {
        upcomingCredentialIds.add(target.credentialId);
      }
    }
  }

  const gaps = accountHealth.map((summary): CadenceGap => {
    const lastPublishedAt =
      lastPublishedByCredential.get(summary.credentialId) ?? null;
    const gapDays = lastPublishedAt
      ? Math.floor(
          (now.getTime() - new Date(lastPublishedAt).getTime()) / MS_PER_DAY,
        )
      : null;

    return {
      accountLabel: summary.label,
      credentialId: summary.credentialId,
      gapDays,
      hasUpcoming: upcomingCredentialIds.has(summary.credentialId),
      holdPublishing: summary.holdPublishing,
      lastPublishedAt,
      needsReconnect: Boolean(summary.reconnect?.isAvailable),
      platform: summary.platform,
    };
  });

  return gaps.sort((left, right) => {
    if (left.gapDays === null && right.gapDays === null) {
      return 0;
    }
    if (left.gapDays === null) {
      return -1;
    }
    if (right.gapDays === null) {
      return 1;
    }
    return right.gapDays - left.gapDays;
  });
}
