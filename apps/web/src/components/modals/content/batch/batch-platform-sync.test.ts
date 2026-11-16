import {
  CredentialPlatform,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

import {
  nextSchedulerInstant,
  resolvePublishingTimezone,
  syncPlatformConfigs,
} from './batch-platform-sync';

function config(
  platform: CredentialPlatform,
  overrides: Partial<IPostPlatformConfig> = {},
): IPostPlatformConfig {
  return {
    credentialId: `${platform}-cred`,
    customScheduledDate: '',
    description: '',
    enabled: true,
    handle: `@${platform}`,
    label: '',
    overrideSchedule: false,
    platform,
    targetExecutionState: TargetExecutionState.SCHEDULED,
    visibility:
      platform === CredentialPlatform.YOUTUBE
        ? PostVisibility.UNLISTED
        : PostVisibility.PUBLIC,
    ...overrides,
  };
}

describe('resolvePublishingTimezone', () => {
  it('uses the browser zone until organization settings declare one', () => {
    expect(resolvePublishingTimezone(undefined, 'Europe/Malta')).toBe(
      'Europe/Malta',
    );
    expect(resolvePublishingTimezone('  ', 'Europe/Malta')).toBe(
      'Europe/Malta',
    );
  });

  it('keeps an explicit organization zone, including UTC', () => {
    expect(resolvePublishingTimezone('UTC', 'Europe/Malta')).toBe('UTC');
    expect(resolvePublishingTimezone(' Europe/Malta ', 'UTC')).toBe(
      'Europe/Malta',
    );
  });

  it('falls back when the organization zone is not a real IANA name', () => {
    expect(resolvePublishingTimezone('Not/AZone', 'Europe/Malta')).toBe(
      'Europe/Malta',
    );
  });
});

describe('syncPlatformConfigs', () => {
  const credentials = [
    {
      externalHandle: '@tube',
      id: 'yt',
      isValid: true,
      platform: CredentialPlatform.YOUTUBE,
    },
    {
      externalHandle: '@tok',
      id: 'tt',
      isValid: true,
      platform: CredentialPlatform.TIKTOK,
    },
  ];

  it('enables valid credentials on first load without widening a later edit', () => {
    const first = syncPlatformConfigs({
      credentials,
      hasUserEdited: false,
      isImage: false,
      platforms: [CredentialPlatform.YOUTUBE, CredentialPlatform.TIKTOK],
      previous: [],
    });

    expect(
      first.map((item) => [item.platform, item.enabled, item.visibility]),
    ).toEqual([
      [CredentialPlatform.YOUTUBE, true, PostVisibility.UNLISTED],
      [CredentialPlatform.TIKTOK, true, PostVisibility.PUBLIC],
    ]);

    const edited = syncPlatformConfigs({
      credentials,
      hasUserEdited: true,
      isImage: false,
      platforms: [CredentialPlatform.YOUTUBE, CredentialPlatform.TIKTOK],
      previous: [
        config(CredentialPlatform.YOUTUBE, {
          enabled: true,
          visibility: PostVisibility.PRIVATE,
        }),
        config(CredentialPlatform.TIKTOK, { enabled: false }),
      ],
    });

    expect(
      edited.find((item) => item.platform === CredentialPlatform.YOUTUBE),
    ).toMatchObject({
      enabled: true,
      visibility: PostVisibility.PRIVATE,
    });
    expect(
      edited.find((item) => item.platform === CredentialPlatform.TIKTOK)
        ?.enabled,
    ).toBe(false);
  });

  it('disables a target whose credential is no longer valid and does not add one', () => {
    const next = syncPlatformConfigs({
      credentials: [
        {
          externalHandle: '@tube',
          id: 'yt',
          isValid: false,
          platform: CredentialPlatform.YOUTUBE,
        },
      ],
      hasUserEdited: true,
      isImage: false,
      platforms: [CredentialPlatform.YOUTUBE],
      previous: [
        config(CredentialPlatform.YOUTUBE, {
          enabled: true,
          visibility: PostVisibility.PRIVATE,
        }),
        config(CredentialPlatform.TIKTOK, { enabled: true }),
      ],
    });

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      enabled: false,
      visibility: PostVisibility.PRIVATE,
    });
  });
});

describe('nextSchedulerInstant', () => {
  it('rounds a late Malta evening forward inside that zone', () => {
    const instant = nextSchedulerInstant(
      new Date('2026-10-15T20:58:30.000Z'),
      'Europe/Malta',
    );
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      timeZone: 'Europe/Malta',
    }).formatToParts(instant);
    const read = (type: string) =>
      parts.find((part) => part.type === type)?.value;

    expect(read('month')).toBe('10');
    expect(read('day')).toBe('15');
    expect(read('hour')).toBe('23');
    expect(read('minute')).toBe('00');
  });
});
