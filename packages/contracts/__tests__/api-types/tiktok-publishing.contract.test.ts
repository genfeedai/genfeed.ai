import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '../../src';
import {
  getChannelCapability,
  resolveChannelTargetSettings,
} from '../../src/api-types/contracts/channel-capabilities.contract';
import { validateTikTokPublishingSettings } from '../../src/api-types/contracts/tiktok-publishing.contract';

describe('TikTok publishing consent', () => {
  it('never supplies privacy or enables interactions for the creator', () => {
    const settings = resolveChannelTargetSettings(
      CredentialPlatform.TIKTOK,
      {},
    );
    expect(settings.privacyLevel).toBeUndefined();
    expect(settings).toMatchObject({
      allowComments: false,
      allowDuet: false,
      allowStitch: false,
    });
    expect(
      getChannelCapability(CredentialPlatform.TIKTOK)?.settings.find(
        (item) => item.key === 'privacyLevel',
      )?.defaultValue,
    ).toBeUndefined();
  });

  it('rejects missing privacy, consent, and unavailable creator choices', () => {
    expect(validateTikTokPublishingSettings({}, ['SELF_ONLY'])).toContain(
      'Choose a TikTok privacy status.',
    );
    expect(
      validateTikTokPublishingSettings(
        { privacyLevel: 'public', musicUsageAccepted: true },
        ['SELF_ONLY'],
      ),
    ).toContain(
      'This privacy status is not available for this TikTok account.',
    );
    expect(
      validateTikTokPublishingSettings({ privacyLevel: 'private' }, [
        'SELF_ONLY',
      ]),
    ).toContain('Confirm TikTok’s Music Usage Confirmation before posting.');
  });

  it('allows an explicitly selected available privacy and confirmed music usage', () => {
    expect(
      validateTikTokPublishingSettings(
        { privacyLevel: 'private', musicUsageAccepted: true },
        ['SELF_ONLY'],
      ),
    ).toEqual([]);
  });

  it('requires commercial disclosure and prevents a private branded-content post', () => {
    const settings = {
      privacyLevel: 'private',
      musicUsageAccepted: true,
      commercialContent: true,
    };
    expect(validateTikTokPublishingSettings(settings)).toContain(
      'Choose Your brand, Branded content, or both.',
    );
    expect(
      validateTikTokPublishingSettings({ ...settings, brandedContent: true }),
    ).toContain('Branded content cannot be private.');
  });
});
