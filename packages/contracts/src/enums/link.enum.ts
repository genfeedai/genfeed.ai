/**
 * Brand link category. Values match Prisma `LinkCategory` exactly.
 *
 * These are Prisma enum labels, not `Platform` ids. The two vocabularies
 * overlap by name only — `links.category` is a Postgres enum column, while
 * `posts.platform` is a lowercase `String`. Do not alias one to the other.
 *
 * @see packages/prisma/prisma/schema.prisma `enum LinkCategory`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const LinkCategory = {
  FACEBOOK: 'FACEBOOK',
  INSTAGRAM: 'INSTAGRAM',
  LINKEDIN: 'LINKEDIN',
  OTHER: 'OTHER',
  TIKTOK: 'TIKTOK',
  TWITTER: 'TWITTER',
  WEBSITE: 'WEBSITE',
  YOUTUBE: 'YOUTUBE',
} as const;

export type LinkCategory = (typeof LinkCategory)[keyof typeof LinkCategory];
