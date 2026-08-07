/**
 * Bookmark source category. Values match Prisma `BookmarkCategory` exactly.
 *
 * These are Prisma enum labels, not `Platform` ids — `bookmarks.category` is a
 * Postgres enum column. The name overlap with `Platform` is coincidental.
 *
 * @see packages/prisma/prisma/schema.prisma `enum BookmarkCategory`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const BookmarkCategory = {
  INSTAGRAM: 'INSTAGRAM',
  TIKTOK: 'TIKTOK',
  TWEET: 'TWEET',
  URL: 'URL',
  YOUTUBE: 'YOUTUBE',
} as const;

export type BookmarkCategory =
  (typeof BookmarkCategory)[keyof typeof BookmarkCategory];

/**
 * Bookmark origin platform. Values match Prisma `BookmarkPlatform` exactly.
 *
 * @see packages/prisma/prisma/schema.prisma `enum BookmarkPlatform`
 */
export const BookmarkPlatform = {
  INSTAGRAM: 'INSTAGRAM',
  TIKTOK: 'TIKTOK',
  TWITTER: 'TWITTER',
  WEB: 'WEB',
  YOUTUBE: 'YOUTUBE',
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
