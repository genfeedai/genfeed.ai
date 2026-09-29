import type { AgentGenerationActionParams } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  didGenerationUseIdentity,
  resolveStudioHandoffIdentityFromSettings,
  resolveStudioHandoffType,
} from './studio-handoff-identity.util';

describe('didGenerationUseIdentity', () => {
  it('is true only when the card originated from identity generation', () => {
    expect(didGenerationUseIdentity({ generationType: 'video' })).toBe(false);
    expect(
      didGenerationUseIdentity({ generationType: 'video', useIdentity: true }),
    ).toBe(true);
    expect(didGenerationUseIdentity({ generationType: 'avatar' })).toBe(true);
  });

  it('reads identity fields the generation-action payload already sends', () => {
    const params: AgentGenerationActionParams = {
      avatarPhotoUrl: 'https://cdn.test/brand.png',
      prompt: 'Say this as the brand.',
      useIdentity: true,
      voiceId: 'brand-voice-1',
    };

    expect(
      didGenerationUseIdentity({
        generationType: 'video',
        useIdentity: params.useIdentity,
      }),
    ).toBe(true);
    expect(params.avatarPhotoUrl).toBe('https://cdn.test/brand.png');
    expect(params.voiceId).toBe('brand-voice-1');
  });
});

describe('resolveStudioHandoffType', () => {
  it('keeps ordinary image and video handoffs on their own type', () => {
    expect(resolveStudioHandoffType({ generationType: 'image' })).toBe('image');
    expect(resolveStudioHandoffType({ generationType: 'video' })).toBe('video');
  });
});

describe('resolveStudioHandoffIdentityFromSettings', () => {
  it('falls back to organization identity when the brand has none', () => {
    expect(
      resolveStudioHandoffIdentityFromSettings({
        brandAgentConfig: {},
        organizationSettings: {
          defaultAvatarPhotoUrl: 'https://cdn.test/org.png',
          defaultVoiceRef: {
            externalVoiceId: 'org-voice',
            source: 'catalog',
          },
        },
      }),
    ).toEqual({
      avatarPhotoUrl: 'https://cdn.test/org.png',
      voiceId: 'org-voice',
    });
  });
});
