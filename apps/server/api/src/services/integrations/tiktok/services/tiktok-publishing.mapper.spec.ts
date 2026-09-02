import { resolveTikTokPrivacyLevel } from '@api/services/integrations/tiktok/services/tiktok-publishing.mapper';

describe('resolveTikTokPrivacyLevel', () => {
  it('uses an offered composer selection', () => {
    expect(
      resolveTikTokPrivacyLevel(['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], 'public'),
    ).toBe('PUBLIC_TO_EVERYONE');
  });

  it('falls back to the account-safe privacy level', () => {
    expect(
      resolveTikTokPrivacyLevel(['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], 'friends'),
    ).toBe('SELF_ONLY');
  });
});
