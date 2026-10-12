import { resolveTikTokPrivacyLevel } from '@api/services/integrations/tiktok/services/tiktok-publishing.mapper';

describe('resolveTikTokPrivacyLevel', () => {
  it('uses an offered composer selection', () => {
    expect(
      resolveTikTokPrivacyLevel(['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], 'public'),
    ).toBe('PUBLIC_TO_EVERYONE');
  });

  it('rejects a missing or unavailable creator selection', () => {
    expect(() =>
      resolveTikTokPrivacyLevel(['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], 'friends'),
    ).toThrow('Choose an available');
    expect(() => resolveTikTokPrivacyLevel(['SELF_ONLY'])).toThrow(
      'Choose an available',
    );
  });
});
