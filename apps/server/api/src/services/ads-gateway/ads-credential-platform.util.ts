import { CredentialPlatform } from '@genfeedai/contracts';
import { AdsPlatform } from '@genfeedai/contracts/interfaces';

const ADS_CREDENTIAL_PLATFORMS: Record<AdsPlatform, CredentialPlatform> = {
  [AdsPlatform.GOOGLE]: CredentialPlatform.GOOGLE_ADS,
  [AdsPlatform.META]: CredentialPlatform.FACEBOOK,
  [AdsPlatform.TIKTOK]: CredentialPlatform.TIKTOK,
  [AdsPlatform.X]: CredentialPlatform.X_ADS,
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
