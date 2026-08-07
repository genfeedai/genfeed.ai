/**
 * Maps domain BatchStatus (lowercase, API-facing) ↔ Prisma BatchStatus
 * (SCREAMING_SNAKE Postgres enum). Domain GENERATING maps to PROCESSING.
 */
import { BatchStatus } from '@genfeedai/enums';
import { BatchStatus as PrismaBatchStatus } from '@genfeedai/prisma';

export function toPrismaBatchStatus(status: BatchStatus): PrismaBatchStatus {
  switch (status) {
    case BatchStatus.PENDING:
      return PrismaBatchStatus.PENDING;
    case BatchStatus.GENERATING:
      return PrismaBatchStatus.PROCESSING;
    case BatchStatus.COMPLETED:
      return PrismaBatchStatus.COMPLETED;
    case BatchStatus.PARTIAL:
      return PrismaBatchStatus.PARTIAL;
    case BatchStatus.FAILED:
      return PrismaBatchStatus.FAILED;
    case BatchStatus.CANCELLED:
      return PrismaBatchStatus.CANCELLED;
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return PrismaBatchStatus.PENDING;
    }
  }
}

export function fromPrismaBatchStatus(
  status: string | null | undefined,
): BatchStatus {
  switch (String(status ?? '')) {
    case PrismaBatchStatus.PENDING:
    case BatchStatus.PENDING:
      return BatchStatus.PENDING;
    case PrismaBatchStatus.PROCESSING:
    case BatchStatus.GENERATING:
      return BatchStatus.GENERATING;
    case PrismaBatchStatus.COMPLETED:
    case BatchStatus.COMPLETED:
      return BatchStatus.COMPLETED;
    case PrismaBatchStatus.PARTIAL:
    case BatchStatus.PARTIAL:
      return BatchStatus.PARTIAL;
    case PrismaBatchStatus.FAILED:
    case BatchStatus.FAILED:
      return BatchStatus.FAILED;
    case PrismaBatchStatus.CANCELLED:
    case BatchStatus.CANCELLED:
      return BatchStatus.CANCELLED;
    default:
      return BatchStatus.PENDING;
  }
}
