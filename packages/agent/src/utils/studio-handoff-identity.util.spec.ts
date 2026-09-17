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
});

describe('resolveStudioHandoffType', () => {
  it('opens identity generations as avatar so Studio shows identity fields', () => {
    expect(
      resolveStudioHandoffType({ generationType: 'video', useIdentity: true }),
    ).toBe('avatar');
  });

  it('keeps ordinary image and video handoffs on their own type', () => {
    expect(resolveStudioHandoffType({ generationType: 'image' })).toBe('image');
    expect(resolveStudioHandoffType({ generationType: 'video' })).toBe('video');
  });
});

describe('resolveStudioHandoffIdentityFromSettings', () => {
  it('prefers the brand identity over organization defaults', () => {
    expect(
      resolveStudioHandoffIdentityFromSettings({
        brandAgentConfig: {
          defaultAvatarPhotoUrl: 'https://cdn.test/brand.png',
          defaultVoiceRef: {
            externalVoiceId: 'brand-voice',
            source: 'catalog',
          },
        },
        organizationSettings: {
          defaultAvatarPhotoUrl: 'https://cdn.test/org.png',
          defaultVoiceRef: {
            externalVoiceId: 'org-voice',
            source: 'catalog',
          },
        },
      }),
    ).toEqual({
      avatarPhotoUrl: 'https://cdn.test/brand.png',
      voiceId: 'brand-voice',
    });
  });

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

  it('returns empty fields rather than inventing an identity', () => {
    expect(
      resolveStudioHandoffIdentityFromSettings({
        brandAgentConfig: {},
        organizationSettings: null,
      }),
    ).toEqual({});
  });
});
