import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { correctedCategoryForLinkedMedia } from '@api/collections/posts/services/channel-target-schedule-validation.util';
import type { ScheduledPostWorkflowInput } from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { scopedWhere } from '@api/index';
import { TargetExecutionState } from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts';
import type { PrismaService } from '@libs/prisma/prisma.service';

/**
 * Load the root Post a scheduled delivery acts on, with its linked
 * ingredients and still-scheduled thread children.
 *
 * A target scheduled before its category followed its media (a release video
 * persisted as TEXT) would fail channel validation and be published as the
 * wrong kind, so the category is corrected from the linked ingredients and
 * persisted before delivery reads it.
 */
export async function loadScheduledActionPost(
  prisma: Pick<PrismaService, 'post'>,
  input: ScheduledPostWorkflowInput,
): Promise<PostEntity | null> {
  const post = await prisma.post.findFirst({
    include: {
      children: {
        include: { credential: true, ingredients: true },
        where: {
          isDeleted: false,
          ...postExecutionStateReadFilter(TargetExecutionState.SCHEDULED),
        },
      },
      ingredients: true,
    },
    where: scopedWhere(input.organizationId, {
      id: input.postId,
      parentId: null,
      ...postExecutionStateReadFilter([
        TargetExecutionState.SCHEDULED,
        TargetExecutionState.PUBLISHING,
      ]),
    }),
  });
  if (!post) {
    return null;
  }

  const correctedCategory = correctedCategoryForLinkedMedia(
    post.category,
    post.ingredients.map((ingredient) => ingredient.category),
  );
  if (!correctedCategory) {
    return post as unknown as PostEntity;
  }
  await prisma.post.updateMany({
    data: { category: correctedCategory },
    where: scopedWhere(input.organizationId, { id: post.id }),
  });
  return { ...post, category: correctedCategory } as unknown as PostEntity;
}
