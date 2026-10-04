import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
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

/**
 * Refuses (not-found) when the character's owning brand was deleted. Call it
 * under the persona lock: a brand deletion that won the lock is committed by
 * then, so sharing, grants and ownership moves cannot succeed after it.
 */
export async function assertOwningBrandLive(
  tx: Pick<Prisma.TransactionClient, 'brand'>,
  brandId: string | null | undefined,
  organizationId: string,
): Promise<void> {
  if (!brandId) {
    return;
  }
  const brand = await tx.brand.findFirst({
    select: { id: true },
    where: scopedWhere(organizationId, { id: brandId }),
  });
  if (!brand) {
    throw new NotFoundException('Brand', brandId);
  }
}

/**
 * Runs `work` in one transaction holding the `persona-handle` lock of every
 * organization, taken in sorted id order so two transactions needing the same
 * pair (a grant takes owner and recipient) can never deadlock.
 */
export async function withPersonaHandleLocks<
  TTx extends Pick<Prisma.TransactionClient, '$queryRaw'>,
  T,
>(
  client: { $transaction: <R>(fn: (tx: TTx) => Promise<R>) => Promise<R> },
  organizationIds: readonly string[],
  work: (tx: TTx) => Promise<T>,
): Promise<T> {
  const ordered = [...new Set(organizationIds)].sort();
  return client.$transaction(async (tx) => {
    for (const organizationId of ordered) {
      await lockPersonaHandleScope(tx, organizationId);
    }
    return work(tx);
  });
}
