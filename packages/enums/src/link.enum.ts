import { Platform } from './platform.enum';

export const LinkCategory = {
  FACEBOOK: Platform.FACEBOOK,
  INSTAGRAM: Platform.INSTAGRAM,
  LINKEDIN: Platform.LINKEDIN,
  OTHER: 'other' as const,
  TIKTOK: Platform.TIKTOK,
  TWITTER: Platform.TWITTER,
  WEBSITE: 'website' as const,
  YOUTUBE: Platform.YOUTUBE,
} as const;

export type LinkCategory = (typeof LinkCategory)[keyof typeof LinkCategory];
