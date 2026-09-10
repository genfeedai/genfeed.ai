import { mapAdsCredentialPlatform } from '@api/services/ads-gateway/ads-credential-platform.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import { AdsPlatform } from '@genfeedai/contracts/interfaces';

describe('mapAdsCredentialPlatform', () => {
  it.each([
    [AdsPlatform.META, CredentialPlatform.FACEBOOK],
    [AdsPlatform.GOOGLE, CredentialPlatform.GOOGLE_ADS],
    [AdsPlatform.TIKTOK, CredentialPlatform.TIKTOK],
    [AdsPlatform.X, CredentialPlatform.X_ADS],
  ] as const)('maps %s to its exact credential platform', (ads, credential) => {
    expect(mapAdsCredentialPlatform(ads)).toBe(credential);
  });
});
