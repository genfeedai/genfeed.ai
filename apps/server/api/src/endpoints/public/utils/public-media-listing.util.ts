import { AssetScope } from '@genfeedai/contracts';
import {
  type PublicMediaSort,
  parsePublicMediaSort,
} from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import type { PrismaWhereQuery } from '@libs/interfaces/query.interface';

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
 * What a gallery card says about how an item was made: its title, the model,
 * the frame and, for a video, its length. Nothing else from the metadata row
 * leaves the API.
 */
const PUBLIC_MEDIA_INCLUDE = {
  metadata: {
    select: {
      duration: true,
      height: true,
      id: true,
      label: true,
      model: true,
      width: true,
    },
  },
} satisfies Prisma.IngredientInclude;

/**
 * A listing across every public creator also names each item's creator, so a
 * card links to its profile. Only the handle leaves the API, and only for
 * creators whose profile is public.
 */
const PUBLIC_CREATOR_MEDIA_INCLUDE = {
  ...PUBLIC_MEDIA_INCLUDE,
  brand: { select: { id: true, slug: true } },
} satisfies Prisma.IngredientInclude;

/** Media whose creator has a public, live profile. */
const PUBLIC_CREATOR_WHERE = {
  brand: { is: { isDeleted: false, scope: AssetScope.PUBLIC } },
};

/**
 * The filter and include of a public image or video list. With
 * `hasPublicCreator=true` the list holds only work from public creators, ranked
 * across all of them before the page is cut, and each item carries its
 * creator's handle.
 */
export function publicMediaListing(hasPublicCreator?: string): {
  include: Prisma.IngredientInclude;
  where: PrismaWhereQuery;
} {
  return hasPublicCreator === 'true'
    ? { include: PUBLIC_CREATOR_MEDIA_INCLUDE, where: PUBLIC_CREATOR_WHERE }
    : { include: PUBLIC_MEDIA_INCLUDE, where: {} };
}
