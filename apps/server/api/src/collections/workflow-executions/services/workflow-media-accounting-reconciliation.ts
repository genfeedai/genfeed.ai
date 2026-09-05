import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { resolveProviderCostUnits } from '@genfeedai/pricing';

export async function reconcileWorkflowMediaCosts(
  prisma: PrismaService,
  organizationId: string,
  executionIds: string[],
): Promise<void> {
  const pending = await prisma.mediaVendorCost.findMany({
    where: {
      organizationId,
      isDeleted: false,
      workflowExecutionId: { in: executionIds },
      costEvidence: { in: ['pending', 'unknown'] },
    },
    select: { id: true, ingredientId: true, pricingSnapshot: true },
  });
  if (!pending.length) return;
  const outputs = await prisma.ingredient.findMany({
    where: {
      id: {
        in: pending.flatMap((row) =>
          row.ingredientId ? [row.ingredientId] : [],
        ),
      },
      organizationId,
      isDeleted: false,
      status: { in: ['GENERATED', 'VALIDATED'] },
    },
    select: {
      id: true,
      metadata: {
        select: { width: true, height: true, duration: true, isDeleted: true },
      },
    },
  });
  for (const row of pending) {
    const output = outputs.find(
      (candidate) => candidate.id === row.ingredientId,
    );
    const metadata = output?.metadata;
    const stamp = row.pricingSnapshot;
    if (
      !metadata ||
      metadata.isDeleted ||
      !stamp ||
      typeof stamp !== 'object' ||
      Array.isArray(stamp)
    )
      continue;
    const price =
      typeof stamp.providerCostUsd === 'number' ? stamp.providerCostUsd : null;
    const type =
      typeof stamp.pricingType === 'string' ? stamp.pricingType : null;
    const hasUnits =
      type === 'flat' ||
      type === 'per-request' ||
      (type === 'per-second' && metadata.duration > 0) ||
      (type === 'per-megapixel' && metadata.width > 0 && metadata.height > 0);
    if (!hasUnits || price === null || price < 0) continue;
    const units = resolveProviderCostUnits(type, null, {
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
    });
    await prisma.mediaVendorCost.updateMany({
      where: {
        id: row.id,
        organizationId,
        isDeleted: false,
        costEvidence: { in: ['pending', 'unknown'] },
      },
      data: {
        units,
        isByok: stamp.isByok === true,
        vendorCostMicros:
          stamp.isByok === true ? 0 : Math.round(price * units * 1_000_000),
        costEvidence: stamp.isByok === true ? 'byok' : 'calculated',
      },
    });
  }
}
