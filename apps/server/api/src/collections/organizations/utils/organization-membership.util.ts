import { OrganizationCategory, type Prisma } from '@genfeedai/prisma';

/**
 * Organizations the user is an active member of. `members` is a relation
 * list, so it takes a `some` filter; a bare user id is rejected by Prisma.
 */
export function organizationsOfMemberWhere(userId: string) {
  return {
    members: { some: { userId, isActive: true, isDeleted: false } },
  } satisfies Prisma.OrganizationWhereInput;
}

/** The personal (creator) organization every user gets on signup. */
export function creatorOrganizationOfMemberWhere(userId: string) {
  return {
    category: OrganizationCategory.CREATOR,
    ...organizationsOfMemberWhere(userId),
  } satisfies Prisma.OrganizationWhereInput;
}
