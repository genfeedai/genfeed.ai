import {
  CredentialPlatform,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  AccountHealthSummary,
  IChannelTarget,
  IClockTime,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { createDateFromTimezone } from '@helpers/formatting/timezone/timezone.helper';
import type {
  AccountGridLane,
  AccountGridLaneItem,
  AccountGridLaneKind,
} from '@props/publisher/account-grid.props';
import type { TargetPreviewCredential } from '@props/ui/previews.props';

export const GAP_LOOKAHEAD_DAYS = 4;
export const GAP_SLOT_MATCH_MS = 60 * 60 * 1000;
export const MAX_GAP_TILES = 3;

const RISK_RANK: Record<AccountHealthSummary['riskLevel'], number> = {
  high: 0,
  medium: 1,
  low: 2,
  unknown: 3,
};

export function laneKindForPlatform(platform: string): AccountGridLaneKind {
  const parsed = parsePlatform(platform);

  if (parsed === CredentialPlatform.INSTAGRAM) {
    return 'grid';
  }
  if (parsed === CredentialPlatform.TIKTOK) {
    return 'portrait';
  }
  if (parsed === CredentialPlatform.YOUTUBE) {
    return 'landscape';
  }

  return 'cards';
}

export function accountLabel(account: AccountHealthSummary): string {
  return account.handle || account.label;
}

export function credentialFromAccount(
  account: AccountHealthSummary,
): TargetPreviewCredential {
  return {
    externalHandle: account.handle,
    externalName: account.label,
    label: account.label,
    platform: account.platform,
  };
}

export function isTargetPublished(target: IChannelTarget): boolean {
  return target.executionState === TargetExecutionState.PUBLISHED;
}

export function targetInstantMs(
  release: IReleaseGroup,
  target: IChannelTarget,
): number | null {
  const value =
    target.scheduledAt ??
    target.publishedAt ??
    release.scheduledAt ??
    release.publishedAt;
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function zonedYmd(
  date: Date,
  timezone: string,
): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  return {
    day: valueFor('day'),
    month: valueFor('month'),
    year: valueFor('year'),
  };
}

/**
 * Empty preferred slots in the next four days. A slot is occupied when any
 * target instant falls within an hour of it. Failed posting-times fetches
 * should pass `[]` so the lane still renders.
 */
export function computeGapSlots({
  now,
  occupiedInstants,
  postingTimes,
  timezone,
}: {
  now: Date;
  occupiedInstants: number[];
  postingTimes: IClockTime[];
  timezone: string;
}): string[] {
  if (postingTimes.length === 0) {
    return [];
  }

  const gaps: string[] = [];
  const nowMs = now.getTime();
  const startOfToday = zonedYmd(now, timezone);

  for (let dayOffset = 0; dayOffset < GAP_LOOKAHEAD_DAYS; dayOffset += 1) {
    const dayAnchor = createDateFromTimezone(
      startOfToday.year,
      startOfToday.month,
      startOfToday.day,
      0,
      0,
      timezone,
    );
    const dayDate = new Date(
      dayAnchor.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    const dayParts = zonedYmd(dayDate, timezone);

    for (const time of postingTimes) {
      const slot = createDateFromTimezone(
        dayParts.year,
        dayParts.month,
        dayParts.day,
        time.hour,
        time.minute,
        timezone,
      );
      const slotMs = slot.getTime();
      if (slotMs <= nowMs) {
        continue;
      }

      const isOccupied = occupiedInstants.some(
        (instant) => Math.abs(instant - slotMs) < GAP_SLOT_MATCH_MS,
      );
      if (isOccupied) {
        continue;
      }

      gaps.push(slot.toISOString());
      if (gaps.length >= MAX_GAP_TILES) {
        return gaps;
      }
    }
  }

  return gaps;
}

function sortLaneItems(items: AccountGridLaneItem[]): AccountGridLaneItem[] {
  const rank = (item: AccountGridLaneItem): number => {
    if (
      item.kind === 'target' &&
      item.target &&
      !isTargetPublished(item.target)
    ) {
      return 0;
    }
    if (item.kind === 'gap') {
      return 1;
    }
    return 2;
  };

  return [...items].sort((left, right) => {
    const rankDelta = rank(left) - rank(right);
    if (rankDelta !== 0) {
      return rankDelta;
    }

    const leftMs =
      left.kind === 'gap'
        ? Date.parse(left.gapAt ?? '')
        : left.release && left.target
          ? (targetInstantMs(left.release, left.target) ?? 0)
          : 0;
    const rightMs =
      right.kind === 'gap'
        ? Date.parse(right.gapAt ?? '')
        : right.release && right.target
          ? (targetInstantMs(right.release, right.target) ?? 0)
          : 0;

    if (
      left.kind === 'target' &&
      left.target &&
      isTargetPublished(left.target)
    ) {
      return rightMs - leftMs;
    }

    return leftMs - rightMs;
  });
}

export function visibleAccounts(
  accounts: AccountHealthSummary[],
  selectedCredentialIds: string[],
): AccountHealthSummary[] {
  if (selectedCredentialIds.length === 0) {
    return accounts;
  }

  const selected = new Set(selectedCredentialIds);
  return accounts.filter((account) => selected.has(account.credentialId));
}

export function buildAccountGridLanes({
  accounts,
  now,
  postingTimesByCredential,
  releases,
  selectedCredentialIds,
  timezone,
}: {
  accounts: AccountHealthSummary[];
  now: Date;
  postingTimesByCredential: Record<string, IClockTime[]>;
  releases: IReleaseGroup[];
  selectedCredentialIds: string[];
  timezone: string;
}): AccountGridLane[] {
  const lanes: AccountGridLane[] = [];

  for (const account of visibleAccounts(accounts, selectedCredentialIds)) {
    const items: AccountGridLaneItem[] = [];
    const occupiedInstants: number[] = [];

    for (const release of releases) {
      for (const target of release.targets ?? []) {
        if (target.credentialId !== account.credentialId) {
          continue;
        }
        items.push({ kind: 'target', release, target });
        const instant = targetInstantMs(release, target);
        if (instant != null) {
          occupiedInstants.push(instant);
        }
      }
    }

    const queuedCount = items.filter(
      (item) => item.target && !isTargetPublished(item.target),
    ).length;

    for (const gapAt of computeGapSlots({
      now,
      occupiedInstants,
      postingTimes: postingTimesByCredential[account.credentialId] ?? [],
      timezone,
    })) {
      items.push({ gapAt, kind: 'gap' });
    }

    lanes.push({
      account,
      credential: credentialFromAccount(account),
      items: sortLaneItems(items),
      kind: laneKindForPlatform(account.platform),
      queuedCount,
    });
  }

  return lanes.sort((left, right) => {
    const leftReconnect = left.account.reconnect?.isAvailable ? 0 : 1;
    const rightReconnect = right.account.reconnect?.isAvailable ? 0 : 1;
    if (leftReconnect !== rightReconnect) {
      return leftReconnect - rightReconnect;
    }

    const riskDelta =
      RISK_RANK[left.account.riskLevel] - RISK_RANK[right.account.riskLevel];
    if (riskDelta !== 0) {
      return riskDelta;
    }

    return accountLabel(left.account).localeCompare(
      accountLabel(right.account),
    );
  });
}
