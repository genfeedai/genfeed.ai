import { CredentialPlatform } from '@genfeedai/enums';

export enum PageScope {
  SUPERADMIN = 'superadmin',
  ORGANIZATION = 'organization',
  BRAND = 'brand',
  ANALYTICS = 'analytics',
  USER = 'user',
  PUBLISHER = 'publisher',
}

export const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  [CredentialPlatform.TWITTER]: 280,
  [CredentialPlatform.INSTAGRAM]: 2200,
  [CredentialPlatform.TIKTOK]: 2200,
  [CredentialPlatform.YOUTUBE]: 5000,
};

export const DEFAULT_CHAR_LIMIT = 5000;

export enum THEME_COLORS {
  PRIMARY = '#000000',
  SECONDARY = '#FFFFFF',
}
