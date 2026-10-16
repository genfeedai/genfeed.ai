import {
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';

import { SCHEDULER_ALLOWED_MINUTES_SET } from './batch-post.utils';

export interface PlatformCredentialSnapshot {
  externalHandle?: string | null;
  id: string;
  isValid: boolean;
  platform: string;
}

export function resolvePublishingTimezone(
  settingsTimezone: string | null | undefined,
  browserTimezone: string,
): string {
  const declared = settingsTimezone?.trim();
  if (!declared) {
    return browserTimezone;
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone: declared });
    return declared;
  } catch {
    return browserTimezone;
  }
}

export function defaultPlatformVisibility(
  platform: CredentialPlatform,
): PostVisibility {
  return platform === CredentialPlatform.YOUTUBE
    ? PostVisibility.UNLISTED
    : PostVisibility.PUBLIC;
}

function wallClock(date: Date, timezone: string): { minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone: timezone,
  }).formatToParts(date);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return { minute: Number.isFinite(minute) ? minute : 0 };
}

/** Next scheduler slot strictly after `now`, measured in `timezone`. */
export function nextSchedulerInstant(now: Date, timezone: string): Date {
  let candidate = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  if (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + 60_000);
  }

  for (let step = 0; step < 20; step += 1) {
    if (
      SCHEDULER_ALLOWED_MINUTES_SET.has(wallClock(candidate, timezone).minute)
    ) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + 60_000);
  }

  return candidate;
}

/**
 * First load applies credential defaults. Later credential refreshes keep the
 * operator's enabled flag and audience, and only drop a target that is no
 * longer a valid credential.
 */
export function syncPlatformConfigs(input: {
  credentials: readonly PlatformCredentialSnapshot[];
  hasUserEdited: boolean;
  isImage: boolean;
  platforms: readonly CredentialPlatform[];
  previous: readonly IPostPlatformConfig[];
}): IPostPlatformConfig[] {
  return input.platforms.map((platform) => {
    const credential =
      input.credentials.find((item) => item.platform === platform) ?? null;
    const kept = input.hasUserEdited
      ? input.previous.find((config) => config.platform === platform)
      : undefined;
    const isCredentialValid = credential ? credential.isValid : undefined;
    const defaultCategory =
      platform === CredentialPlatform.INSTAGRAM
        ? input.isImage
          ? PostCategory.IMAGE
          : PostCategory.VIDEO
        : undefined;
    const enabled = kept
      ? Boolean(kept.enabled && credential?.isValid)
      : Boolean(credential?.isValid);

    return {
      category: kept?.category ?? defaultCategory,
      credentialId: credential?.id ?? '',
      customScheduledDate: kept?.customScheduledDate ?? '',
      description: kept?.description ?? '',
      enabled,
      handle: credential?.externalHandle ?? '',
      isCredentialValid,
      isShareToFeedSelected: kept?.isShareToFeedSelected ?? false,
      label: kept?.label ?? '',
      overrideSchedule: kept?.overrideSchedule ?? false,
      platform,
      targetExecutionState:
        kept?.targetExecutionState ?? TargetExecutionState.SCHEDULED,
      visibility: kept?.visibility ?? defaultPlatformVisibility(platform),
    };
  });
}
