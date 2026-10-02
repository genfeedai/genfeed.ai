import {
  agentSourceIdSchema,
  agentSourceScopeSchema,
  agentSourceTimestampSchema,
  type RankAgentSourcesInput,
  rankEligibleAgentSources,
} from '@api/collections/agent-strategies/sources/agent-source-candidates';
import { resolveAgentSourcePolicy } from '@api/collections/agent-strategies/sources/agent-source-policy';
import type { Prisma, PrismaClient } from '@genfeedai/prisma';
import { z } from 'zod';

const select = {
  id: true,
  organizationId: true,
  brandId: true,
  capturedAt: true,
  isDeleted: true,
  usagePolicy: true,
} satisfies Prisma.SavedAdSelect;
const cursorSchema = z
  .object({
    capturedAt: agentSourceTimestampSchema,
    id: agentSourceIdSchema,
  })
  .strict();
// Keep take (including one-row lookahead) within the signed 32-bit Int range.
// This is a representability limit; the caller still supplies its operational bound.
const MAX_PAGE_SIZE = 2_147_483_647 - 1;
const paginationSchema = z
  .object({
    pageSize: z.number().int().positive().max(MAX_PAGE_SIZE),
    maxPageSize: z.number().int().positive().max(MAX_PAGE_SIZE),
    after: cursorSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.pageSize <= value.maxPageSize,
    'Page exceeds explicit bound',
  );
export type SavedAdSourceCursor = Readonly<z.infer<typeof cursorSchema>>;
const readInputSchema = z
  .object({
    scope: agentSourceScopeSchema,
    now: agentSourceTimestampSchema,
    pagination: paginationSchema,
  })
  .strict();
export type ReadSavedAdSourcesInput = Readonly<
  z.infer<typeof readInputSchema>
> &
  Pick<RankAgentSourcesInput, 'policy' | 'blockedSourceKeys'>;
export type SavedAdSourcePage = Awaited<
  ReturnType<typeof readSavedAdSourcePage>
>;

/** Internal read-only page adapter. Continuations require the same scope, policy and now.
 * A page is not a global eligible snapshot or a reservation authorization. New or
 * recaptured rows between calls require a new scan; this is not database snapshot isolation.
 */
export async function readSavedAdSourcePage(
  savedAd: Pick<PrismaClient['savedAd'], 'findMany'>,
  input: ReadSavedAdSourcesInput,
) {
  const {
    scope,
    now: nowString,
    pagination,
  } = readInputSchema.parse({
    scope: input.scope,
    now: input.now,
    pagination: input.pagination,
  });
  const policy = resolveAgentSourcePolicy(
    input.policy,
    input.policy.freshnessWindowMs,
  );
  const now = Date.parse(nowString);
  const lower = new Date(now - policy.freshnessWindowMs);
  if (!Number.isFinite(now) || !Number.isFinite(lower.getTime()))
    throw new Error('Invalid saved-ad freshness interval');
  const after = pagination.after;
  if (
    after &&
    (Date.parse(after.capturedAt) < lower.getTime() ||
      Date.parse(after.capturedAt) > now)
  )
    throw new Error('Saved-ad cursor outside freshness interval');
  // Capture caller-owned blocked membership before yielding to persistence.
  const blockedSourceKeys = new Set(input.blockedSourceKeys);
  if (!policy.enabledKinds.includes('saved_ads'))
    return Object.freeze({
      candidates: Object.freeze([]),
      scannedCount: 0,
      hasMore: false,
      nextCursor: null,
    });
  const rows = await savedAd.findMany({
    select,
    where: {
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      isDeleted: false,
      usagePolicy: 'remix_allowed',
      capturedAt: { gte: lower, lte: new Date(now) },
      ...(after
        ? {
            OR: [
              { capturedAt: { lt: new Date(after.capturedAt) } },
              { capturedAt: new Date(after.capturedAt), id: { gt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ capturedAt: 'desc' }, { id: 'asc' }],
    take: pagination.pageSize + 1,
  });
  const pageRows = rows.slice(0, pagination.pageSize);
  const hasMore = rows.length > pagination.pageSize;
  const last = pageRows.at(-1);
  const candidates = rankEligibleAgentSources({
    scope,
    policy,
    now: nowString,
    blockedSourceKeys,
    candidates: pageRows.map((row) => ({
      scope: { organizationId: row.organizationId, brandId: row.brandId },
      sourceKind: 'saved_ad',
      sourceId: row.id,
      selector: { kind: 'saved_ad', savedAdId: row.id },
      observedAt: row.capturedAt.toISOString(),
      isDeleted: row.isDeleted,
      usageAllowed: row.usagePolicy === 'remix_allowed',
    })),
  });
  return Object.freeze({
    candidates,
    // Counts query page rows before blocked filtering, excluding lookahead.
    scannedCount: pageRows.length,
    hasMore,
    nextCursor:
      hasMore && last
        ? Object.freeze({
            capturedAt: last.capturedAt.toISOString(),
            id: last.id,
          })
        : null,
  });
}
