import { CredentialPlatform } from '@genfeedai/enums';

export const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  [CredentialPlatform.TWITTER]: 280,
  [CredentialPlatform.INSTAGRAM]: 2200,
  [CredentialPlatform.TIKTOK]: 2200,
  [CredentialPlatform.YOUTUBE]: 5000,
};

export const DEFAULT_CHAR_LIMIT = 5000;
