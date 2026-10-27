import {
  OWNED_INBOX_POST_ORDER_BY,
  publishedInboxPostStateFilter,
} from '@api/collections/posts/services/post-publication-capture.filters';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PostStatus } from '@genfeedai/contracts';

/**
 * Text of the latest published root posts of a brand on one platform, newest
 * first. Drafts and scheduled posts are not included: this is what the
 * audience has already seen.
 */
export async function listRecentPublishedTexts(
  prisma: PrismaService,
  organizationId: string,
  brandId: string,
  platform: string,
  limit: number,
): Promise<string[]> {
  const posts = await prisma.post.findMany({
    orderBy: OWNED_INBOX_POST_ORDER_BY,
    select: { description: true },
    take: limit,
    where: scopedWhere(organizationId, {
      AND: [publishedInboxPostStateFilter([PostStatus.PUBLIC])],
      brandId,
      description: { not: '' },
      parentId: null,
      platform,
    }),
  });
  return posts.map((post) => post.description);
}
