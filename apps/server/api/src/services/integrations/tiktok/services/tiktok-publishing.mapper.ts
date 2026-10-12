import { TIKTOK_PRIVACY_OPTIONS } from '@genfeedai/contracts/api-types/contracts';

export function resolveTikTokPrivacyLevel(
  availablePrivacyLevels: string[],
  requestedPrivacy?: string,
): string {
  const requestedLevel = TIKTOK_PRIVACY_OPTIONS.find(
    (option) => option.value === requestedPrivacy,
  )?.providerValue;

  if (requestedLevel && availablePrivacyLevels.includes(requestedLevel)) {
    return requestedLevel;
  }

  throw new Error('Choose an available TikTok privacy status before posting.');
}
