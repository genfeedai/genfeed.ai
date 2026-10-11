import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';

// Prisma error codes the relocation transaction maps to a clear response.
// P2034 — serialization failure (SQLSTATE 40001) under Serializable isolation: the
//   transaction was aborted by a read/write conflict with a concurrent transaction.
//   The caller retries it; it is not mapped here.
// P2002 — unique constraint violation: mapped to a 409 ConflictException.
// P2003 — foreign key violation. The composite organization keys are deferred
//   for the move and checked at commit; a violation means a row still names a
//   parent that stayed behind, so the whole move is rolled back.
// P2028 — transaction API error: the interactive transaction expired or could not
//   start in time. Nothing was moved; mapped to a retryable 503.
export const PRISMA_SERIALIZATION_FAILURE = 'P2034';
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const PRISMA_FOREIGN_KEY_VIOLATION = 'P2003';
const PRISMA_TRANSACTION_API_ERROR = 'P2028';

// A database trigger refused the cascade: the row is immutable or append-only.
// The guards refuse these brands first; this maps any that slip past them.
const IMMUTABLE_ROW_PATTERN = /immutable|append-only|cannot be rebound/i;

export interface RelocationFailureContext {
  brandId: string;
  destOrgId: string;
  sourceOrgId: string;
}

/**
 * The response for a failed relocation transaction, or `null` when the failure
 * is not one the relocation knows how to explain (a serialization failure, which
 * the caller retries, or anything unexpected, which is rethrown as it is).
 */
export function mapRelocationFailure(
  error: unknown,
  logger: Pick<LoggerService, 'error'>,
  context: RelocationFailureContext,
): HttpException | null {
  const errorCode = (error as { code?: string }).code;

  if (errorCode === PRISMA_UNIQUE_CONSTRAINT_VIOLATION) {
    const uniqueTarget = (error as Prisma.PrismaClientKnownRequestError).meta
      ?.target;
    const target = Array.isArray(uniqueTarget)
      ? uniqueTarget.join(', ')
      : 'a unique constraint';
    return new ConflictException(
      `Cannot move brand: a record in the destination organization already conflicts on ${target}.`,
    );
  }

  if (errorCode === PRISMA_FOREIGN_KEY_VIOLATION) {
    logger.error('Brand relocation left a stale reference', error, context);
    return new ConflictException(
      'Cannot move this brand: a record that belongs to it still references the previous organization, so nothing was moved.',
    );
  }

  if (errorCode === PRISMA_TRANSACTION_API_ERROR) {
    logger.error('Brand relocation transaction timed out', error, context);
    return new ServiceUnavailableException(
      'Moving this brand took too long and was rolled back; nothing moved. Try again, or move it when less work is running.',
    );
  }

  // The guards' own conflicts quote "append-only" and must reach the caller
  // unchanged; only a raw database refusal is remapped.
  if (
    errorCode !== PRISMA_SERIALIZATION_FAILURE &&
    error instanceof Error &&
    !(error instanceof HttpException) &&
    IMMUTABLE_ROW_PATTERN.test(error.message)
  ) {
    return new ConflictException(
      'Cannot move this brand: it owns a record that is immutable or append-only and must stay in its original organization.',
    );
  }

  return null;
}
