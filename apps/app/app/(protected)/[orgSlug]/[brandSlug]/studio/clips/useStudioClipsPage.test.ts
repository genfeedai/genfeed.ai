import type { IBrand, IOrganizationSetting } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';

import { resolveStudioClipIdentityDefaults } from './useStudioClipsPage';

describe('resolveStudioClipIdentityDefaults', () => {
  it('prefills saved brand HeyGen avatar and voice defaults', () => {
    const selectedBrand = {
      agentConfig: {
        heygenAvatarId: 'brand-avatar-1',
        heygenVoiceId: 'brand-voice-1',
      },
    } satisfies Pick<IBrand, 'agentConfig'>;

    expect(
      resolveStudioClipIdentityDefaults({ selectedBrand, settings: null }),
    ).toEqual({
      avatarId: 'brand-avatar-1',
      avatarProvider: 'heygen',
      isComplete: true,
      missing: [],
      source: 'brand',
      voiceId: 'brand-voice-1',
    });
  });

  it('combines saved brand avatar with organization HeyGen voice ref', () => {
    const selectedBrand = {
      agentConfig: {
        heygenAvatarId: 'brand-avatar-2',
      },
    } satisfies Pick<IBrand, 'agentConfig'>;
    const settings = {
      defaultVoiceRef: {
        externalVoiceId: 'org-voice-2',
        provider: 'heygen',
        source: 'catalog',
      },
    } satisfies Pick<IOrganizationSetting, 'defaultVoiceRef'>;

    expect(
      resolveStudioClipIdentityDefaults({ selectedBrand, settings }),
    ).toEqual({
      avatarId: 'brand-avatar-2',
      avatarProvider: 'heygen',
      isComplete: true,
      missing: [],
      source: 'brand',
      voiceId: 'org-voice-2',
    });
  });

  it('ignores non-HeyGen voice refs for direct clip generation', () => {
    const selectedBrand = {
      agentConfig: {
        heygenAvatarId: 'brand-avatar-3',
        defaultVoiceRef: {
          externalVoiceId: 'elevenlabs-voice-3',
          provider: 'elevenlabs',
          source: 'catalog',
        },
      },
    } satisfies Pick<IBrand, 'agentConfig'>;

    expect(
      resolveStudioClipIdentityDefaults({ selectedBrand, settings: null }),
    ).toEqual({
      avatarId: 'brand-avatar-3',
      avatarProvider: 'heygen',
      isComplete: false,
      missing: ['voice'],
      source: 'brand',
      voiceId: undefined,
    });
  });
});
