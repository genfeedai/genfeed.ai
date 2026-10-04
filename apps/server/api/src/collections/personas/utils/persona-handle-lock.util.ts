import type { Prisma } from '@genfeedai/prisma';

/**
 * Takes the per-organization `persona-handle` advisory lock for the rest of
 * the transaction. Character sharing, grants, handle changes and brand
 * deletion all take it so they serialize against each other.
 */
export async function lockPersonaHandleScope(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  organizationId: string,
): Promise<void> {
  const key = `persona-handle:${organizationId}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}
