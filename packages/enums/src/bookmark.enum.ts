import { Platform } from './platform.enum';

export const BookmarkCategory = {
  INSTAGRAM: Platform.INSTAGRAM,
  TIKTOK: Platform.TIKTOK,
  TWEET: 'tweet' as const,
  URL: 'url' as const,
  YOUTUBE: Platform.YOUTUBE,
} as const;

export type BookmarkCategory =
  (typeof BookmarkCategory)[keyof typeof BookmarkCategory];

export const BookmarkPlatform = {
  INSTAGRAM: Platform.INSTAGRAM,
  TIKTOK: Platform.TIKTOK,
  TWITTER: Platform.TWITTER,
  WEB: 'web' as const,
  YOUTUBE: Platform.YOUTUBE,
} as const;

export type BookmarkPlatform =
  (typeof BookmarkPlatform)[keyof typeof BookmarkPlatform];

export enum BookmarkIntent {
  VIDEO = 'video',
  IMAGE = 'image',
  REPLY = 'reply',
  REFERENCE = 'reference',
  INSPIRATION = 'inspiration',
}
