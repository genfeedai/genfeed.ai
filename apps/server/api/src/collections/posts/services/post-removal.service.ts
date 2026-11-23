import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostPlatformDeletionService } from '@api/collections/posts/services/post-platform-deletion.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { PostPlatformDeletionStatus } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable, Optional } from '@nestjs/common';

/** A thread has far fewer replies; the cap bounds the read. */
const MAX_THREAD_REPLIES = 500;

export interface PostRemovalParams {
  /** When set, a post of another brand is not found. */
  brandId?: string;
  /**
   * Also delete the post on its social network first. When the network refuses
   * (or the platform is not supported) nothing is deleted at all.
   */
  deleteOnPlatform?: boolean;
  /** The caller, for the Library edit rule on each asset. */
  editor: { brandId: string; userId: string };
  /** Also delete the media that only this post (and its thread replies) uses. */
  includeMedia: boolean;
  organizationId: string;
  postId: string;
}

export interface PostRemovalResult {
  /** True only when the provider confirmed the network copy is gone. */
  deletedOnPlatform: boolean;
  platformDeletion: PostPlatformDeletionStatus;
  media: {
    /** Soft-deleted Library assets. */
    deleted: string[];
    /** Assets left in the Library: another post uses them, or the caller may not edit them. */
    kept: { id: string; reason: 'not-editable' | 'used-by-another-post' }[];
  };
  platform: string | null;
  postId: string;
  /** The post's status before the deletion. */
  previousStatus: string;
  /** The public URL of the post on its network, when it was published. */
  publishedUrl: string | null;
  /** Read back after the writes, from the database. */
  verified: { mediaGone: boolean; postGone: boolean };
}

/**
 * Deletes a post, published ones included, and optionally the Library media
 * only it uses, and on request the post on its social network. Genfeed's own
 * delete is a soft delete (`isDeleted`).
 */
@Traced()
@Injectable()
export class PostRemovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
    private readonly ingredientsService: IngredientsService,
    private readonly platformDeletion: PostPlatformDeletionService,
    private readonly logger: LoggerService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  /** `null` when the post does not exist in the organization (or brand). */
  async removePost(
    params: PostRemovalParams,
  ): Promise<PostRemovalResult | null> {
    const {
      brandId,
      deleteOnPlatform = false,
      editor,
      includeMedia,
      organizationId,
      postId,
    } = params;

    const post = await this.prisma.post.findFirst({
      select: {
        brandId: true,
        credentialId: true,
        entityIngredientId: true,
        externalId: true,
        id: true,
        ingredientLinks: {
          select: { ingredientId: true },
          where: { ingredient: { isDeleted: false } },
        },
        platform: true,
        status: true,
        url: true,
      },
      where: scopedWhere(organizationId, {
        id: postId,
        ...(brandId ? { brandId } : {}),
      }),
    });
    if (!post) return null;

    const replies = await this.prisma.post.findMany({
      select: {
        entityIngredientId: true,
        id: true,
        ingredientLinks: {
          select: { ingredientId: true },
          where: { ingredient: { isDeleted: false } },
        },
      },
      take: MAX_THREAD_REPLIES,
      where: scopedWhere(organizationId, { parentId: post.id }),
    });
    const removedPostIds = [post.id, ...replies.map((reply) => reply.id)];

    const candidateIds = includeMedia
      ? [
          ...new Set(
            [post, ...replies].flatMap((row) => [
              ...row.ingredientLinks.map((link) => link.ingredientId),
              ...(row.entityIngredientId ? [row.entityIngredientId] : []),
            ]),
          ),
        ]
      : [];
    const sharedIds = await this.findIdsUsedElsewhere(
      organizationId,
      candidateIds,
      removedPostIds,
    );

    // The network copy goes first: when the provider refuses, this throws and
    // nothing has been deleted, in Genfeed or on the network.
    const platformDeletion: PostPlatformDeletionStatus = deleteOnPlatform
      ? await this.platformDeletion.deleteOnPlatform(organizationId, post)
      : 'not-requested';

    const removed = await this.postsService.remove(post.id);
    if (!removed) return null;

    const deleted: string[] = [];
    const kept: PostRemovalResult['media']['kept'] = [];
    for (const id of candidateIds) {
      if (sharedIds.has(id)) {
        kept.push({ id, reason: 'used-by-another-post' });
        continue;
      }
      const asset = await this.ingredientsService.softDeleteOneScoped({
        editor,
        id,
        organizationId,
      });
      if (asset) deleted.push(id);
      else kept.push({ id, reason: 'not-editable' });
    }
    if (deleted.length > 0) await this.invalidateLibraryCache();

    const verified = await this.readBack(organizationId, post.id, deleted);
    this.logger.log('Post removed', {
      deletedMedia: deleted.length,
      keptMedia: kept.length,
      organizationId,
      platformDeletion,
      postId: post.id,
      verified,
    });

    return {
      deletedOnPlatform: platformDeletion === 'deleted',
      media: { deleted, kept },
      platform: post.platform,
      platformDeletion,
      postId: post.id,
      previousStatus: post.status,
      publishedUrl: post.url,
      verified,
    };
  }

  /** Candidates a live post outside the removed set still links or points at. */
  private async findIdsUsedElsewhere(
    organizationId: string,
    candidateIds: string[],
    removedPostIds: string[],
  ): Promise<Set<string>> {
    const used = new Set<string>();
    // One existence check per candidate: a post has a handful of media.
    for (const ingredientId of candidateIds) {
      const other = await this.prisma.post.findFirst({
        select: { id: true },
        where: scopedWhere(organizationId, {
          id: { notIn: removedPostIds },
          OR: [
            { entityIngredientId: ingredientId },
            { ingredientLinks: { some: { ingredientId } } },
          ],
        }),
      });
      if (other) used.add(ingredientId);
    }
    return used;
  }

  private async readBack(
    organizationId: string,
    postId: string,
    mediaIds: string[],
  ): Promise<PostRemovalResult['verified']> {
    const [post, media] = await Promise.all([
      this.prisma.post.findFirst({
        select: { id: true },
        where: scopedWhere(organizationId, { id: postId }),
      }),
      mediaIds.length === 0
        ? Promise.resolve([])
        : this.prisma.ingredient.findMany({
            select: { id: true },
            where: scopedWhere(organizationId, { id: { in: mediaIds } }),
          }),
    ]);
    return { mediaGone: media.length === 0, postGone: post === null };
  }

  private async invalidateLibraryCache(): Promise<void> {
    try {
      await this.cacheService?.invalidateByTags(['ingredients']);
    } catch (error: unknown) {
      this.logger.warn('Could not invalidate the Library list cache', {
        error,
      });
    }
  }
}
