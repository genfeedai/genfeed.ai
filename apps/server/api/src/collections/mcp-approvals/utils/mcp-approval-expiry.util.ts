import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  MCP_APPROVAL_EXPIRED_REASON,
  MCP_APPROVAL_EXPIRY_DAYS,
} from '@genfeedai/contracts/interfaces';
import { McpApprovalStatus, type Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';

const MS_PER_DAY = 86_400_000;

/** The moment before which a pending approval is stale. */
export function mcpApprovalExpiryCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - MCP_APPROVAL_EXPIRY_DAYS * MS_PER_DAY);
}

/**
 * Closes the organization's pending MCP approvals older than the expiry age as
 * declined with the reason `expired` (#10134), so an abandoned request stops
 * counting toward the pending cap and leaves the review inbox. Returns how
 * many it closed.
 */
export const expireStaleMcpApprovals = traced(
  'expireStaleMcpApprovals',
  async (
    delegate: Pick<Prisma.McpApprovalDelegate, 'updateMany'>,
    organizationId: string,
    now: Date = new Date(),
  ): Promise<number> => {
    const { count } = await delegate.updateMany({
      data: {
        resolvedAt: now,
        result: { reason: MCP_APPROVAL_EXPIRED_REASON },
        status: McpApprovalStatus.DECLINED,
      },
      where: scopedWhere(organizationId, {
        createdAt: { lt: mcpApprovalExpiryCutoff(now) },
        status: McpApprovalStatus.PENDING,
      }),
    });
    return count;
  },
);
