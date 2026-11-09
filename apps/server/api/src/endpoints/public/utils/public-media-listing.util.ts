import {
  type PublicMediaSort,
  parsePublicMediaSort,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';

const PUBLIC_MEDIA_ORDER: Record<
  PublicMediaSort,
  Prisma.IngredientOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: 'desc' }],
  recreations: [{ recreateCount: 'desc' }, { createdAt: 'desc' }],
  views: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
};

/** The order of a public image or video list, from its `sortBy` query value. */
export function publicMediaOrderBy(
  sortBy?: string,
): Prisma.IngredientOrderByWithRelationInput[] {
  return PUBLIC_MEDIA_ORDER[parsePublicMediaSort(sortBy)];
}

/**
 * What a gallery card says about how an item was made: its title, the model
 * and, for a video, its length. Nothing else from the metadata row leaves the
 * API.
 */
export const PUBLIC_MEDIA_INCLUDE = {
  metadata: {
    select: { duration: true, id: true, label: true, model: true },
  },
} satisfies Prisma.IngredientInclude;
