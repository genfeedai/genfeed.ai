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

/**
 * Bookmark intent. Values match Prisma `BookmarkIntent`.
 * @see packages/prisma/prisma/schema.prisma `enum BookmarkIntent`
 */
export enum BookmarkIntent {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  REPLY = 'REPLY',
  REFERENCE = 'REFERENCE',
  INSPIRATION = 'INSPIRATION',
}
