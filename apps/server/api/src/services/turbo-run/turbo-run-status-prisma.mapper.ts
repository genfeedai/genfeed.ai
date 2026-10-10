/**
 * TurboRunStatus domain values must match Prisma/Postgres labels (SCREAMING_SNAKE).
 *
 * This mapper always emits literal Postgres labels so a stale `@genfeedai/contracts`
 * dist (lowercase `pending` / `generating`) cannot write invalid enum values.
 *
 * @see packages/contracts/src/enums/batch.enum.ts
 * @see packages/prisma/prisma/schema.prisma `enum TurboRunStatus`
 */
import { TurboRunStatus } from '@genfeedai/contracts';
import { TurboRunStatus as PrismaTurboRunStatus } from '@genfeedai/prisma';

/** Postgres `TurboRunStatus` labels — never derived from a possibly-stale domain enum. */
const PRISMA_PENDING = 'PENDING' as PrismaTurboRunStatus;
const PRISMA_PROCESSING = 'PROCESSING' as PrismaTurboRunStatus;
const PRISMA_COMPLETED = 'COMPLETED' as PrismaTurboRunStatus;
const PRISMA_PARTIAL = 'PARTIAL' as PrismaTurboRunStatus;
const PRISMA_FAILED = 'FAILED' as PrismaTurboRunStatus;
const PRISMA_CANCELLED = 'CANCELLED' as PrismaTurboRunStatus;

/**
 * Accept domain SCREAMING_SNAKE, legacy lowercase, and the retired GENERATING
 * alias, and always return a Prisma-valid TurboRunStatus label.
 */
export function toPrismaTurboRunStatus(
  status: TurboRunStatus | string | null | undefined,
): PrismaTurboRunStatus {
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
export function fromPrismaTurboRunStatus(
  status: string | null | undefined,
): TurboRunStatus {
  switch (String(status ?? '').toUpperCase()) {
    case 'PENDING':
      return TurboRunStatus.PENDING;
    case 'PROCESSING':
    case 'GENERATING':
      return TurboRunStatus.PROCESSING;
    case 'COMPLETED':
      return TurboRunStatus.COMPLETED;
    case 'PARTIAL':
      return TurboRunStatus.PARTIAL;
    case 'FAILED':
      return TurboRunStatus.FAILED;
    case 'CANCELLED':
    case 'CANCELED':
      return TurboRunStatus.CANCELLED;
    default:
      return TurboRunStatus.PENDING;
  }
}
