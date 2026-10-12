import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { correctedCategoryForLinkedMedia } from '@api/collections/posts/services/channel-target-schedule-validation.util';
import {
  flattenPostTreeIngredients,
  orderedPostIngredientLinks,
} from '@api/collections/posts/services/post-ingredient-links.util';
import type { ScheduledPostWorkflowInput } from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { scopedWhere } from '@api/index';
import { TargetExecutionState } from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts';
import type { PrismaService } from '@libs/prisma/prisma.service';

/**
 * Load the root Post a scheduled delivery acts on, with its linked
 * ingredients and still-scheduled thread children.
 *
 * Ingredients load in slide order (the position the user arranged), so a
 * carousel is delivered in the order it was composed.
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
  const loaded = await prisma.post.findFirst({
    include: {
      children: {
        include: {
          credential: true,
          ingredientLinks: orderedPostIngredientLinks(),
        },
        where: {
          isDeleted: false,
          ...postExecutionStateReadFilter(TargetExecutionState.SCHEDULED),
        },
      },
      ingredientLinks: orderedPostIngredientLinks(),
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
  if (!loaded) {
    return null;
  }
  const post = flattenPostTreeIngredients(loaded);

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
