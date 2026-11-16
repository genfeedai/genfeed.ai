import type {
  PublishApprovalContractCodec,
  PublishApprovalRow,
} from '@api/publish-approvals/publish-approval-contract.codec';
import type { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';
import { ConflictException } from '@nestjs/common';

/**
 * Compare-and-set an invalidation on the status that was just read. The read
 * and the write are separate statements, so an execution claim can land
 * between them; matching on id alone would then overwrite EXECUTING while the
 * provider call is already in flight.
 */
export const invalidateObservedApproval = traced(
  'invalidateObservedApproval',
  async (
    tx: Pick<Prisma.TransactionClient, 'publishApproval'>,
    codec: PublishApprovalContractCodec,
    observed: PublishApprovalRow,
    data: Prisma.PublishApprovalUncheckedUpdateInput,
  ): Promise<void> => {
    try {
      await tx.publishApproval.update({
        data,
        where: { id: observed.id, status: codec.parseStatus(observed.status) },
      });
    } catch (error: unknown) {
      // P2025: the status guard matched no row, so the approval moved on.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new ConflictException(
          'Cannot invalidate a publish approval that changed while it was being invalidated.',
        );
      }
      throw error;
    }
  },
);
