import { mapAdsCredentialPlatform } from '@api/services/ads-gateway/ads-credential-platform.util';
import { CredentialPlatform } from '@genfeedai/enums';

describe('mapAdsCredentialPlatform', () => {
  it.each([
    ['meta', CredentialPlatform.FACEBOOK],
    ['google', CredentialPlatform.GOOGLE_ADS],
    ['tiktok', CredentialPlatform.TIKTOK],
    ['x', CredentialPlatform.X_ADS],
  ] as const)('maps %s to its exact credential platform', (ads, credential) => {
    expect(mapAdsCredentialPlatform(ads)).toBe(credential);
  });
});
