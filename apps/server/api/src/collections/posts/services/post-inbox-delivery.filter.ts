import { Platform, TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

/**
 * A TikTok Inbox receipt as a Prisma `where`: the target reads `published`, but
 * the upload waits in the creator's TikTok Inbox and is not a public post.
 * Restates `isTikTokInboxDelivered` (`@genfeedai/contracts`), which the spec
 * checks it against row for row.
 */
export const TIKTOK_INBOX_DELIVERY_WHERE: Prisma.PostWhereInput = {
  AND: [
    { platform: Platform.TIKTOK },
    { targetExecutionState: TargetExecutionState.PUBLISHED },
    { externalId: { not: null } },
    { externalId: { not: '' } },
    { publicationDate: null },
    { publishedAt: null },
    { OR: [{ url: null }, { url: '' }] },
  ],
};

/**
 * Every row that is not an Inbox receipt. Spelled out branch by branch rather
 * than as `NOT` over the filter above, because SQL `NOT` over a NULL column
 * drops the row instead of keeping it.
 */
export const NOT_TIKTOK_INBOX_DELIVERY_WHERE: Prisma.PostWhereInput = {
  OR: [
    { platform: null },
    { platform: { not: Platform.TIKTOK } },
    { targetExecutionState: { not: TargetExecutionState.PUBLISHED } },
    { externalId: null },
    { externalId: '' },
    { publicationDate: { not: null } },
    { publishedAt: { not: null } },
    { AND: [{ url: { not: null } }, { url: { not: '' } }] },
  ],
};

/** Posts that are live: `published` and not an Inbox receipt. */
export const PUBLISHED_AND_LIVE_WHERE: Prisma.PostWhereInput = {
  AND: [
    { targetExecutionState: TargetExecutionState.PUBLISHED },
    NOT_TIKTOK_INBOX_DELIVERY_WHERE,
  ],
};

/** Posts a "not posted" view lists: anything not live, Inbox receipts included. */
export const NOT_LIVE_WHERE: Prisma.PostWhereInput = {
  OR: [
    { targetExecutionState: { not: TargetExecutionState.PUBLISHED } },
    TIKTOK_INBOX_DELIVERY_WHERE,
  ],
};

/**
 * Posts whose release roll-up state is one of `states`: an Inbox receipt counts
 * as `draft`, never as `published` (`releaseRollupTargetState`).
 */
export function postRollupExecutionStateFilter(
  states: TargetExecutionState | readonly TargetExecutionState[],
): Prisma.PostWhereInput {
  const requested: readonly TargetExecutionState[] =
    typeof states === 'string' ? [states] : states;
  return {
    OR: requested.map((state): Prisma.PostWhereInput => {
      switch (state) {
        case TargetExecutionState.PUBLISHED:
          return PUBLISHED_AND_LIVE_WHERE;
        case TargetExecutionState.DRAFT:
          return {
            OR: [
              { targetExecutionState: TargetExecutionState.DRAFT },
              TIKTOK_INBOX_DELIVERY_WHERE,
            ],
          };
        default:
          return { targetExecutionState: state };
      }
    }),
  };
}
