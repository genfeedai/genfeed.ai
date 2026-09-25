import type { PublishApprovalRow } from '@api/publish-approvals/publish-approval-contract.codec';
import type { Prisma } from '@genfeedai/prisma';
import { HttpException, HttpStatus } from '@nestjs/common';

export class PublishApprovalNotFoundException extends HttpException {
  constructor(resource: string, identifier: string) {
    const detail = `${resource} with identifier '${identifier}' not found`;
    super(
      {
        detail,
        source: { parameter: identifier },
        title: 'Resource Not Found',
      },
      HttpStatus.NOT_FOUND,
    );
    this.message = detail;
  }
}

export async function findPublishApprovalOrThrow(
  publishApproval: Prisma.TransactionClient['publishApproval'],
  organizationId: string,
  approvalId: string,
  postId?: string,
): Promise<PublishApprovalRow> {
  const approval = await publishApproval.findFirst({
    where: {
      id: approvalId,
      organizationId,
      ...(postId ? { postId } : {}),
    },
  });
  if (!approval) {
    throw new PublishApprovalNotFoundException('PublishApproval', approvalId);
  }
  return approval as PublishApprovalRow;
}
