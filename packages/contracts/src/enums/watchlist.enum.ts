import { Platform } from './platform.enum';

export const WatchlistPlatform = {
  INSTAGRAM: Platform.INSTAGRAM,
  TIKTOK: Platform.TIKTOK,
  TWITTER: Platform.TWITTER,
  YOUTUBE: Platform.YOUTUBE,
} as const;

export type WatchlistPlatform =
  (typeof WatchlistPlatform)[keyof typeof WatchlistPlatform];
