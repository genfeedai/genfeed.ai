import {
  CredentialPlatform,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ICredential,
  IPostPlatformConfig,
} from '@genfeedai/contracts/interfaces';
import {
  buildPostCharacterUsageItems,
  countCaptionCharacters,
} from '@ui/posts/character-usage/post-character-usage.util';
import { describe, expect, it } from 'vitest';

function config(
  overrides: Partial<IPostPlatformConfig> = {},
): IPostPlatformConfig {
  return {
    credentialId: 'cred-1',
    customScheduledDate: '',
    description: '',
    enabled: true,
    handle: 'nevo',
    label: '',
    overrideSchedule: false,
    platform: CredentialPlatform.LINKEDIN,
    targetExecutionState: TargetExecutionState.DRAFT,
    visibility: PostVisibility.PUBLIC,
    ...overrides,
  };
}

describe('countCaptionCharacters', () => {
  it('counts code points so one emoji costs one character', () => {
    expect(countCaptionCharacters('ab🎉')).toBe(3);
  });

  it('treats a missing caption as empty', () => {
    expect(countCaptionCharacters(undefined)).toBe(0);
  });
});

describe('buildPostCharacterUsageItems', () => {
  it('reads each channel limit from the capability catalog', () => {
    const items = buildPostCharacterUsageItems(
      [
        config({
          credentialId: 'cred-li',
          platform: CredentialPlatform.LINKEDIN,
        }),
        config({
          credentialId: 'cred-x',
          platform: CredentialPlatform.TWITTER,
        }),
      ],
      'hello',
    );

    expect(items.map((item) => [item.platformLabel, item.limit])).toEqual([
      ['LinkedIn', 3000],
      ['X (Twitter)', 280],
    ]);
    expect(items.every((item) => item.used === 5)).toBe(true);
  });

  it('counts the per-channel override instead of the shared caption', () => {
    const [item] = buildPostCharacterUsageItems(
      [config({ description: 'override caption' })],
      'shared',
    );

    expect(item?.used).toBe('override caption'.length);
  });

  it('skips disabled channels and channels with no account', () => {
    const items = buildPostCharacterUsageItems(
      [
        config({ credentialId: 'cred-off', enabled: false }),
        config({ credentialId: '   ' }),
      ],
      'hello',
    );

    expect(items).toEqual([]);
  });

  it('names the account from the credential when the target carries no handle', () => {
    const credentials = [
      { id: 'cred-1', externalName: 'Nevo David' } as ICredential,
    ];

    const [item] = buildPostCharacterUsageItems(
      [config({ handle: '' })],
      'hello',
      credentials,
    );

    expect(item?.accountLabel).toBe('Nevo David');
  });
});
