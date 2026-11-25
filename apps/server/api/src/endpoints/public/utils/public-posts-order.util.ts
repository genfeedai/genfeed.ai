import type { Prisma } from '@genfeedai/prisma';

/**
 * Newest published first, the order a profile's tiles show their dates in.
 *
 * `publishedAt` is null on a post whose provider never reported one (the
 * YouTube completion handler stamps `publicationDate` only). PostgreSQL sorts
 * nulls first on DESC, so without `nulls: 'last'` such a post would outrank
 * every dated one on every page. Prisma cannot order by
 * `COALESCE(publishedAt, createdAt)`, so an undated post trails the dated ones
 * (newest first among themselves) instead of interleaving by `createdAt`.
 * `id` breaks ties so a page boundary never repeats or skips a post.
 */
export const PUBLIC_POSTS_ORDER_BY: Prisma.PostOrderByWithRelationInput[] = [
  { publishedAt: { nulls: 'last', sort: 'desc' } },
  { publicationDate: { nulls: 'last', sort: 'desc' } },
  { createdAt: 'desc' },
  { id: 'desc' },
];
