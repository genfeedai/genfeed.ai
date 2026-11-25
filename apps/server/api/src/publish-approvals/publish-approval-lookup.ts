import {
  flattenPostIngredients,
  orderedPostIngredientLinks,
} from '@api/collections/posts/services/post-ingredient-links.util';
import type {
  ApprovalPost,
  PublishApprovalRow,
} from '@api/publish-approvals/publish-approval-contract.codec';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';
import { HttpException, HttpStatus } from '@nestjs/common';

class PublishApprovalNotFoundException extends HttpException {
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

/** The post fields an approval binds to, with its ingredients in order. */
export const findApprovalPostOrThrow = traced(
  'findApprovalPostOrThrow',
  async (
    post: Prisma.TransactionClient['post'],
    organizationId: string,
    postId: string,
  ): Promise<ApprovalPost> => {
    const row = await post.findFirst({
      select: {
        agentContextVersion: true,
        brandId: true,
        credentialId: true,
        id: true,
        ingredientLinks: orderedPostIngredientLinks({ select: { id: true } }),
        isDeleted: true,
        organizationId: true,
        platform: true,
        publishApprovalId: true,
        scheduledDate: true,
        status: true,
        targetExecutionState: true,
        timezone: true,
      },
      where: scopedWhere(organizationId, { id: postId }),
    });
    if (!row) throw new PublishApprovalNotFoundException('Post', postId);
    return flattenPostIngredients(row) as unknown as ApprovalPost;
  },
);
