import type { BrandedGenerationReceiptReadV1 } from '@genfeedai/contracts/interfaces/content/branded-generation-receipt-read.interface';
import type {
  GenerationReceiptCostSummary,
  GenerationReceiptStatusKey,
} from '@genfeedai/props/content/branded-generation-receipt.props';

const STATUS_BY_STATE: Readonly<
  Record<BrandedGenerationReceiptReadV1['state'], GenerationReceiptStatusKey>
> = {
  created: 'pending',
  resolved: 'pending',
  dispatched: 'pending',
  checking: 'pending',
  ready: 'completed',
  needs_review: 'needsReview',
  blocked: 'blocked',
  failed: 'failed',
  cancelled: 'cancelled',
};

/** The list status a receipt state reads as. */
export function getGenerationReceiptStatus(
  state: BrandedGenerationReceiptReadV1['state'],
): GenerationReceiptStatusKey {
  return STATUS_BY_STATE[state];
}

/**
 * The Library output a receipt describes: its bound ingredient artifact, or
 * the ingredient a Studio media receipt was opened for before it was bound.
 */
export function getGenerationReceiptMediaId(
  receipt: BrandedGenerationReceiptReadV1,
): string | null {
  if (receipt.artifact?.kind === 'ingredient') return receipt.artifact.id;
  if (
    (receipt.contentType === 'image' || receipt.contentType === 'video') &&
    receipt.generationId
  )
    return receipt.generationId;
  return null;
}

/**
 * Sums only ledger-backed credits. Without one, the summary says whether the
 * cost is still pending or was recorded as unavailable; it never estimates.
 */
export function getGenerationReceiptCost(
  receipt: BrandedGenerationReceiptReadV1,
): GenerationReceiptCostSummary {
  const known = receipt.costs.filter(
    (cost) => cost.status === 'known' && cost.credits !== undefined,
  );
  if (known.length)
    return {
      status: 'known',
      credits: known.reduce((total, cost) => total + (cost.credits ?? 0), 0),
    };
  if (receipt.costs.some((cost) => cost.status === 'pending'))
    return { status: 'pending' };
  if (receipt.costs.some((cost) => cost.status === 'unavailable'))
    return { status: 'unavailable' };
  return { status: 'none' };
}
