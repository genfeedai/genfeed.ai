import { scopedWhere } from '@api/index';
import { Prisma } from '@genfeedai/prisma';

export interface KnowledgeChunkFilter {
  exceptVersionId?: string;
  manifestId?: string;
  unmanifestedOnly?: boolean;
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
  const versionWhere = filter.exceptVersionId
    ? { knowledgeSourceVersionId: { not: filter.exceptVersionId } }
    : filter.versionId
      ? { knowledgeSourceVersionId: filter.versionId }
      : {};
  const where = scopedWhere(organizationId, {
    ...(filter.sourceId ? { knowledgeSourceId: filter.sourceId } : {}),
    ...versionWhere,
    ...(filter.manifestId
      ? { knowledgeEmbeddingManifestId: filter.manifestId }
      : {}),
    ...(filter.unmanifestedOnly ? { knowledgeEmbeddingManifestId: null } : {}),
  });
  return softDeleteContextEntries(prisma, organizationId, where);
}

/** Caller holds each linked source lock before retiring its derived entries. */
export async function softDeleteContextEntries(
  prisma: Prisma.TransactionClient,
  organizationId: string,
  where: Prisma.ContextEntryWhereInput,
): Promise<number> {
  const scoped = { ...where, organizationId, isDeleted: false };
  const perBase = await prisma.contextEntry.groupBy({
    by: ['contextBaseId'],
    where: scoped,
    _count: { _all: true },
  });
  if (perBase.length === 0) {
    return 0;
  }
  for (const id of perBase.map((group) => group.contextBaseId).sort()) {
    await prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "context_bases" WHERE "id" = ${id}
      AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`);
  }
  await prisma.contextEmbeddingJob.updateMany({
    where: {
      organizationId,
      isDeleted: false,
      status: { in: ['PENDING', 'RETRYABLE', 'PROCESSING'] },
      contextEntry: { is: scoped },
    },
    data: {
      status: 'CANCELLED',
      leaseToken: null,
      leaseExpiresAt: null,
      safeFailureCode: 'SOURCE_RETIRED',
    },
  });
  const removed = await prisma.contextEntry.updateMany({
    data: { isDeleted: true, embeddingGeneration: { increment: 1 } },
    where: scoped,
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
