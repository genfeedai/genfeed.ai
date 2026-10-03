import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { AgentContentMentionItem } from '@genfeedai/contracts/interfaces';

const MAX_CONTENT_MENTION_LIMIT = 100;

export async function listPostContentMentions(
  prisma: PrismaService,
  organizationId: string,
  brandId?: string,
  limit = 50,
): Promise<AgentContentMentionItem[]> {
  if (!organizationId) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), MAX_CONTENT_MENTION_LIMIT);
  const posts = await prisma.post.findMany({
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: {
      brandId: true,
      category: true,
      description: true,
      entityArticle: {
        select: {
          coverImageUrl: true,
          label: true,
        },
      },
      entityIngredient: {
        select: {
          cdnUrl: true,
          sampleAudioUrl: true,
        },
      },
      id: true,
      label: true,
    },
    take: safeLimit,
    where: scopedWhere(organizationId, brandId ? { brandId } : {}),
  });

  return posts.map((post) => {
    const title =
      post.label?.trim() ||
      post.entityArticle?.label.trim() ||
      post.description.trim();
    return {
      brandId: post.brandId,
      contentTitle: title.length <= 80 ? title : `${title.slice(0, 77)}...`,
      contentType: String(post.category).toLowerCase(),
      id: post.id,
      thumbnailUrl:
        post.entityArticle?.coverImageUrl ??
        post.entityIngredient?.cdnUrl ??
        post.entityIngredient?.sampleAudioUrl ??
        undefined,
    };
  });
}
