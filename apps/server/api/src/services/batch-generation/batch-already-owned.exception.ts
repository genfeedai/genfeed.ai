import { BadRequestException } from '@nestjs/common';

/**
 * A live run already owns this batch — thrown by the ownership claim when the
 * atomic PENDING → PROCESSING transition (or the stale-lease reclaim) loses.
 *
 * Distinct from a plain BadRequestException on purpose: the workers processor
 * drops duplicate deliveries on this error without settling, but must never
 * swallow genuine validation or credit failures the same way — those settle
 * what landed and rethrow so BullMQ can retry or fail the job. HTTP callers
 * still see a 400 because it extends BadRequestException.
 */
export class BatchAlreadyOwnedException extends BadRequestException {
  constructor(batchId: string, status: string) {
    super(`Batch ${batchId} is already being processed (status: ${status})`);
  }
}
