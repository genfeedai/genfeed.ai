import { Prisma } from '@genfeedai/prisma';

export interface KnowledgeChunkFilter {
  sourceId?: string;
  versionId?: string;
}

/**
 * Soft-delete every live chunk that belongs to one Knowledge source or one
 * source version and keep each context base's `entryCount` in sync. Used on
 * re-ingest (before new chunks land), source deletion and payload purge, so a
 * retired version never stays retrievable through a stale chunk.
 */
export async function softDeleteKnowledgeChunks(
  prisma: Prisma.TransactionClient,
  organizationId: string,
  filter: KnowledgeChunkFilter,
): Promise<number> {
  if (!filter.sourceId && !filter.versionId) {
    throw new Error('A knowledge source or version id is required');
  }
  const where: Prisma.ContextEntryWhereInput = {
    organizationId,
    isDeleted: false,
    ...(filter.sourceId ? { knowledgeSourceId: filter.sourceId } : {}),
    ...(filter.versionId ? { knowledgeSourceVersionId: filter.versionId } : {}),
  };
  const perBase = await prisma.contextEntry.groupBy({
    by: ['contextBaseId'],
    where,
    _count: { _all: true },
  });
  if (perBase.length === 0) {
    return 0;
  }
  const removed = await prisma.contextEntry.updateMany({
    where,
    data: { isDeleted: true },
  });
  for (const group of perBase) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "context_bases"
      SET "data" = jsonb_set(
        COALESCE("data", '{}'::jsonb),
        ARRAY['entryCount'],
        to_jsonb(GREATEST(0, COALESCE("data"->>'entryCount', '0')::int - ${group._count._all}))
      )
      WHERE "organizationId" = ${organizationId}
        AND "isDeleted" = false
        AND "id" = ${group.contextBaseId}
    `);
  }
  return removed.count;
}
