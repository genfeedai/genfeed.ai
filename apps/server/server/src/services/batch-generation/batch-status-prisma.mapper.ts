/**
 * BatchStatus domain values must match Prisma/Postgres labels (SCREAMING_SNAKE).
 *
 * This mapper always emits literal Postgres labels so a stale `@genfeedai/enums`
 * dist (lowercase `pending` / `generating`) cannot write invalid enum values.
 *
 * @see packages/enums/src/batch.enum.ts
 * @see packages/prisma/prisma/schema.prisma `enum BatchStatus`
 */
import { BatchStatus } from '@genfeedai/enums';
import { BatchStatus as PrismaBatchStatus } from '@genfeedai/prisma';

/** Postgres `BatchStatus` labels — never derived from a possibly-stale domain enum. */
const PRISMA_PENDING = 'PENDING' as PrismaBatchStatus;
const PRISMA_PROCESSING = 'PROCESSING' as PrismaBatchStatus;
const PRISMA_COMPLETED = 'COMPLETED' as PrismaBatchStatus;
const PRISMA_PARTIAL = 'PARTIAL' as PrismaBatchStatus;
const PRISMA_FAILED = 'FAILED' as PrismaBatchStatus;
const PRISMA_CANCELLED = 'CANCELLED' as PrismaBatchStatus;

/**
 * Accept domain SCREAMING_SNAKE, legacy lowercase, and the retired GENERATING
 * alias, and always return a Prisma-valid BatchStatus label.
 */
export function toPrismaBatchStatus(
  status: BatchStatus | string | null | undefined,
): PrismaBatchStatus {
  switch (String(status ?? '').toUpperCase()) {
    case 'PENDING':
      return PRISMA_PENDING;
    case 'PROCESSING':
    case 'GENERATING':
      return PRISMA_PROCESSING;
    case 'COMPLETED':
      return PRISMA_COMPLETED;
    case 'PARTIAL':
      return PRISMA_PARTIAL;
    case 'FAILED':
      return PRISMA_FAILED;
    case 'CANCELLED':
    case 'CANCELED':
      return PRISMA_CANCELLED;
    default:
      return PRISMA_PENDING;
  }
}

/**
 * Accepts Prisma labels and legacy lowercase spellings written before the
 * SCREAMING_SNAKE harmonization so existing rows still deserialize.
 */
export function fromPrismaBatchStatus(
  status: string | null | undefined,
): BatchStatus {
  switch (String(status ?? '').toUpperCase()) {
    case 'PENDING':
      return BatchStatus.PENDING;
    case 'PROCESSING':
    case 'GENERATING':
      return BatchStatus.PROCESSING;
    case 'COMPLETED':
      return BatchStatus.COMPLETED;
    case 'PARTIAL':
      return BatchStatus.PARTIAL;
    case 'FAILED':
      return BatchStatus.FAILED;
    case 'CANCELLED':
    case 'CANCELED':
      return BatchStatus.CANCELLED;
    default:
      return BatchStatus.PENDING;
  }
}
