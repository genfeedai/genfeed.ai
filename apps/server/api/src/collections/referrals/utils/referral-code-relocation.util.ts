import type { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

/**
 * Clears the brand link of every affiliate code that points at a brand moving
 * to another organization. A code belongs to its owner's billing account and
 * never moves with the brand; its brand link is only a label, so it is cleared
 * rather than left pointing into another tenant. Runs in the caller's
 * transaction.
 */
export const detachReferralCodesFromBrand = traced(
  'detachReferralCodesFromBrand',
  async (tx: Prisma.TransactionClient, brandId: string): Promise<void> => {
    // sql-risk-audit: ignore bulk-write-tenant-review -- Keyed by the moving brand's id; affiliate codes are owned by a user and billing account, so the brand link is cleared for every owner, deleted codes included.
    await tx.referralCode.updateMany({
      data: { brandId: null },
      where: { brandId },
    });
  },
);
