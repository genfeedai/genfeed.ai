/**
 * BatchStatus domain values are identical to Prisma `$Enums.BatchStatus`.
 * These helpers exist only to give Prisma the generated type without `as never`.
 *
 * Do not reintroduce lowercase domain spellings. If a new status is added,
 * update both `packages/enums` and `schema.prisma` in the same change.
 */
import { BatchStatus } from '@genfeedai/enums';
import { BatchStatus as PrismaBatchStatus } from '@genfeedai/prisma';

const PRISMA_BY_DOMAIN: Record<BatchStatus, PrismaBatchStatus> = {
  [BatchStatus.PENDING]: PrismaBatchStatus.PENDING,
  [BatchStatus.PROCESSING]: PrismaBatchStatus.PROCESSING,
  [BatchStatus.COMPLETED]: PrismaBatchStatus.COMPLETED,
  [BatchStatus.PARTIAL]: PrismaBatchStatus.PARTIAL,
  [BatchStatus.FAILED]: PrismaBatchStatus.FAILED,
  [BatchStatus.CANCELLED]: PrismaBatchStatus.CANCELLED,
};

const DOMAIN_BY_PRISMA: Record<PrismaBatchStatus, BatchStatus> = {
  [PrismaBatchStatus.PENDING]: BatchStatus.PENDING,
  [PrismaBatchStatus.PROCESSING]: BatchStatus.PROCESSING,
  [PrismaBatchStatus.COMPLETED]: BatchStatus.COMPLETED,
  [PrismaBatchStatus.PARTIAL]: BatchStatus.PARTIAL,
  [PrismaBatchStatus.FAILED]: BatchStatus.FAILED,
  [PrismaBatchStatus.CANCELLED]: BatchStatus.CANCELLED,
};

export function toPrismaBatchStatus(status: BatchStatus): PrismaBatchStatus {
  return PRISMA_BY_DOMAIN[status];
}

/**
 * Accepts Prisma labels and legacy lowercase spellings written before the
 * SCREAMING_SNAKE harmonization so existing rows still deserialize.
 */
export function fromPrismaBatchStatus(
  status: string | null | undefined,
): BatchStatus {
  const raw = String(status ?? '');
  if (raw in DOMAIN_BY_PRISMA) {
    return DOMAIN_BY_PRISMA[raw as PrismaBatchStatus];
  }

  switch (raw.toLowerCase()) {
    case 'pending':
      return BatchStatus.PENDING;
    case 'processing':
    case 'generating':
      return BatchStatus.PROCESSING;
    case 'completed':
      return BatchStatus.COMPLETED;
    case 'partial':
      return BatchStatus.PARTIAL;
    case 'failed':
      return BatchStatus.FAILED;
    case 'cancelled':
    case 'canceled':
      return BatchStatus.CANCELLED;
    default:
      return BatchStatus.PENDING;
  }
}
