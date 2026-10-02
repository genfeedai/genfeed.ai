import type {
  PublishApprovalContractCodec,
  PublishApprovalRow,
} from '@api/publish-approvals/publish-approval-contract.codec';
import { findPublishApprovalOrThrow } from '@api/publish-approvals/publish-approval-lookup';
import { PublishApprovalStatus } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
export const PUBLISH_EXECUTION_LEASE_MS = 15 * 60 * 1000;
export async function resetExpiredPublishExecution(
  client: Pick<Prisma.TransactionClient, 'publishApproval'>,
  codec: PublishApprovalContractCodec,
  approval: PublishApprovalRow,
): Promise<PublishApprovalRow> {
  const expiresAt = approval.updatedAt.getTime() + PUBLISH_EXECUTION_LEASE_MS;
  if (expiresAt > Date.now()) {
    throw new ConflictException(
      'Publish approval is already executing with an active lease.',
    );
  }

  const resetAt = new Date();
  const reason = 'Expired publish execution lease was reset for retry.';
  const reset = await client.publishApproval.updateMany({
    data: {
      lastError: reason,
      status: PublishApprovalStatus.QUEUED,
      statusTransitions: codec.toJson([
        ...codec.readTransitions(approval.statusTransitions),
        codec.transition(
          PublishApprovalStatus.EXECUTING,
          PublishApprovalStatus.FAILED,
          undefined,
          reason,
        ),
        codec.transition(
          PublishApprovalStatus.FAILED,
          PublishApprovalStatus.QUEUED,
          undefined,
          'Retry queued after expired execution lease.',
        ),
      ]),
      updatedAt: resetAt,
    },
    where: {
      id: approval.id,
      organizationId: approval.organizationId,
      status: PublishApprovalStatus.EXECUTING,
      updatedAt: approval.updatedAt,
    },
  });
  if (reset.count !== 1) {
    throw new ConflictException(
      'Publish execution lease changed before it could be reset.',
    );
  }
  return findPublishApprovalOrThrow(
    client.publishApproval,
    approval.organizationId,
    approval.id,
    approval.postId,
  );
}
