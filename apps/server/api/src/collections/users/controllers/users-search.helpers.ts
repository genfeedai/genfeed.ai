import type { Prisma } from '@genfeedai/prisma';

/**
 * The `where` fragment for the superadmin user search: a case-insensitive
 * match on email, either name or the handle. An empty or blank term adds no
 * constraint.
 */
export function buildUserSearchWhere(
  search: string | undefined,
): Prisma.UserWhereInput {
  const term = search?.trim();
  if (!term) {
    return {};
  }

  const contains = { contains: term, mode: 'insensitive' } as const;
  return {
    OR: [
      { email: contains },
      { firstName: contains },
      { lastName: contains },
      { name: contains },
      { handle: contains },
    ],
  };
}
