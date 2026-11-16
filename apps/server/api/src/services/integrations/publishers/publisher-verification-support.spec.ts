import { PUBLISHER_PROVIDERS } from '@api/services/integrations/publishers/publisher-factory.service';
import { UNVERIFIABLE_PUBLISH_REASONS } from '@api/services/integrations/publishers/publisher-verification-support';
import { CredentialPlatform } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const VERIFIABLE_PLATFORMS = [
  CredentialPlatform.BEEHIIV,
  CredentialPlatform.DEV_TO,
  CredentialPlatform.FACEBOOK,
  CredentialPlatform.GHOST,
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.MASTODON,
  CredentialPlatform.SHOPIFY,
  CredentialPlatform.SLACK,
  CredentialPlatform.THREADS,
  CredentialPlatform.TWITTER,
  CredentialPlatform.WORDPRESS,
  CredentialPlatform.YOUTUBE,
];

const UNVERIFIABLE_PLATFORMS = [
  CredentialPlatform.DISCORD,
  CredentialPlatform.FANVUE,
  CredentialPlatform.GENFEED,
  CredentialPlatform.MEDIUM,
  CredentialPlatform.PINTEREST,
  CredentialPlatform.REDDIT,
  CredentialPlatform.SNAPCHAT,
  CredentialPlatform.TELEGRAM,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.WHATSAPP,
];

function hasVerifier(platform: CredentialPlatform): boolean {
  const entry = PUBLISHER_PROVIDERS.find(([key]) => key === platform);
  return typeof entry?.[1].prototype.verifyPublished === 'function';
}

describe('publisher verification coverage', () => {
  it.each(VERIFIABLE_PLATFORMS)(
    '%s confirms an uncertain publish',
    (platform) => {
      expect(hasVerifier(platform)).toBe(true);
      expect(UNVERIFIABLE_PUBLISH_REASONS[platform]).toBeUndefined();
    },
  );

  it.each(UNVERIFIABLE_PLATFORMS)(
    '%s states why it cannot confirm an uncertain publish',
    (platform) => {
      expect(hasVerifier(platform)).toBe(false);
      expect(UNVERIFIABLE_PUBLISH_REASONS[platform]?.length).toBeGreaterThan(
        20,
      );
    },
  );

  it('leaves no registered publisher without a decision', () => {
    const decided = [...VERIFIABLE_PLATFORMS, ...UNVERIFIABLE_PLATFORMS].sort();
    expect(PUBLISHER_PROVIDERS.map(([platform]) => platform).sort()).toEqual(
      decided,
    );
  });
});
