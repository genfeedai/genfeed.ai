const TIKTOK_PRIVACY_LEVEL_BY_SETTING: Record<string, string> = {
  friends: 'MUTUAL_FOLLOW_FRIENDS',
  private: 'SELF_ONLY',
  public: 'PUBLIC_TO_EVERYONE',
};

const PREFERRED_PRIVACY_LEVEL = 'SELF_ONLY';

export function resolveTikTokPrivacyLevel(
  availablePrivacyLevels: string[],
  requestedPrivacy?: string,
): string {
  const requestedLevel = requestedPrivacy
    ? TIKTOK_PRIVACY_LEVEL_BY_SETTING[requestedPrivacy]
    : undefined;

  if (requestedLevel && availablePrivacyLevels.includes(requestedLevel)) {
    return requestedLevel;
  }

  return availablePrivacyLevels.includes(PREFERRED_PRIVACY_LEVEL)
    ? PREFERRED_PRIVACY_LEVEL
    : availablePrivacyLevels[0];
}
