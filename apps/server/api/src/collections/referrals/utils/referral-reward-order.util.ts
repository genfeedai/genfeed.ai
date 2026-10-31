import { handleAllowedQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Columns the superadmin referral rewards list can be ordered by. The
 * referrer, referred and checkout columns show shortened ids, which have no
 * order worth sorting by.
 */
export const REFERRAL_REWARD_SORT_FIELDS: readonly string[] = [
  'attemptCount',
  'eligibleAt',
  'netAmountCents',
  'status',
];

/**
 * The `orderBy` for the superadmin referral rewards list: the requested
 * column, then newest first, then id, so rows with equal values keep a stable
 * page order. An unknown or missing sort falls back to newest first.
 */
export function buildReferralRewardOrderBy(
  sort: string | undefined,
): Prisma.ReferralRewardOrderByWithRelationInput[] {
  const requested = handleAllowedQuerySort(
    sort,
    REFERRAL_REWARD_SORT_FIELDS,
    {},
  );

  return [
    ...Object.entries(requested).map(
      ([field, direction]) =>
        ({
          [field]: direction === 1 ? 'asc' : 'desc',
        }) as Prisma.ReferralRewardOrderByWithRelationInput,
    ),
    { createdAt: 'desc' },
    { id: 'desc' },
  ];
}
