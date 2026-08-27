import { CredentialPlatform } from '@genfeedai/enums';
import type { AdsPlatform } from '@genfeedai/interfaces';

const ADS_CREDENTIAL_PLATFORMS: Record<AdsPlatform, CredentialPlatform> = {
  google: CredentialPlatform.GOOGLE_ADS,
  meta: CredentialPlatform.FACEBOOK,
  tiktok: CredentialPlatform.TIKTOK,
  x: CredentialPlatform.X_ADS,
};

/**
 * Ads gateway names are deliberately narrower than social credential names.
 * In particular, `x` must resolve to X_ADS rather than the organic TWITTER
 * credential used by the generic platform mapper.
 */
export function mapAdsCredentialPlatform(
  platform: AdsPlatform,
): CredentialPlatform {
  return ADS_CREDENTIAL_PLATFORMS[platform];
}
