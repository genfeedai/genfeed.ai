import type { SchedulerTx } from '@api/collections/post-groups/services/post-group.types';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { PostCategory } from '@genfeedai/contracts';

/** Aborts the binding transaction when another caller bound the root first. */
export class ReleaseBindingLostError extends Error {
  constructor() {
    super('Post was bound to a release by a concurrent request');
    this.name = 'ReleaseBindingLostError';
  }
}

export function buildReleaseMedia(post: {
  category: string;
  ingredients: readonly { id: string }[];
}): { assetId: string; kind: 'image' | 'video'; order: number }[] {
  const kind =
    post.category === PostCategory.VIDEO || post.category === PostCategory.REEL
      ? 'video'
      : 'image';
  return post.ingredients.map((ingredient, order) => ({
    assetId: ingredient.id,
    kind,
    order,
  }));
}

/**
 * Compare-and-set on the groupId the caller read: if a concurrent caller bound
 * the root first this throws, so the surrounding transaction rolls back and
 * the group created for the loser never survives as an orphan release.
 */
export async function bindPostToRelease(
  tx: SchedulerTx,
  organizationId: string,
  post: { groupId?: string | null; id: string },
  groupId: string,
): Promise<void> {
  const bound = await tx.post.updateMany({
    data: { groupId },
    where: scopedWhere(organizationId, {
      groupId: post.groupId ?? null,
      id: post.id,
    }),
  });
  if (bound.count === 0) {
    throw new ReleaseBindingLostError();
  }
}

/** The release the winning caller bound to the post. */
export async function findBoundGroupId(
  db: Pick<PrismaService, 'post'>,
  organizationId: string,
  postId: string,
): Promise<string> {
  const winner = await db.post.findFirst({
    select: { groupId: true },
    where: scopedWhere(organizationId, { id: postId }),
  });
  if (!winner?.groupId) {
    throw new NotFoundException('Post', postId);
  }
  return winner.groupId;
}
