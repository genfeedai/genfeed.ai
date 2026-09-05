import { CreateMcpApprovalDto } from '@api/collections/mcp-approvals/dto/create-mcp-approval.dto';
import { UpdateMcpApprovalDto } from '@api/collections/mcp-approvals/dto/update-mcp-approval.dto';
import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
import {
  type ApiKeyPublishingContext,
  assertApiKeyPublishingScope,
  isPublishingMcpApprovalTool,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { scopedWhere } from '@api/index';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { buildLogicalWriteKey } from '@genfeedai/actions';
import { McpApprovalStatus, Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Hard ceiling on concurrently-PENDING approvals per organization. Caps the
 * blast radius of a buggy or hostile MCP client that queues write tools in a
 * loop — once an org has this many unresolved approvals, new requests are
 * rejected until some are approved/declined.
 */
const MAX_PENDING_APPROVALS_PER_ORG = 100;

@Injectable()
export class McpApprovalsService extends BaseService<
  McpApprovalDocument,
  CreateMcpApprovalDto,
  UpdateMcpApprovalDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly notificationsPublisher: NotificationsPublisherService,
  ) {
    super(prisma, 'mcpApproval', logger);
  }

  async createPending(
    organizationId: string,
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: { threadId?: string },
  ): Promise<McpApprovalDocument> {
    const idempotencyKey = buildLogicalWriteKey({
      arguments: args,
      organizationId,
      threadId: options?.threadId,
      toolName,
      userId,
    });
    const existing = (await this.delegate.findFirst({
      where: scopedWhere(organizationId, {
        idempotencyKey,
        status: {
          in: [McpApprovalStatus.APPROVED, McpApprovalStatus.PENDING],
        },
      }),
      orderBy: { createdAt: 'desc' },
    })) as McpApprovalDocument | null;
    if (existing) {
      return existing;
    }

    const pendingCount = await this.delegate.count({
      where: scopedWhere(organizationId, { status: McpApprovalStatus.PENDING }),
    });

    if (pendingCount >= MAX_PENDING_APPROVALS_PER_ORG) {
      throw new BadRequestException(
        `Organization has reached the maximum of ${MAX_PENDING_APPROVALS_PER_ORG} pending MCP approvals. Resolve existing requests before queueing more.`,
      );
    }

    let approval: McpApprovalDocument;
    try {
      approval = (await this.delegate.create({
        data: {
          arguments: args,
          idempotencyKey,
          organizationId,
          status: McpApprovalStatus.PENDING,
          toolName,
          userId,
        },
      })) as McpApprovalDocument;
    } catch (error: unknown) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.findActiveByIdempotencyKey(
          organizationId,
          idempotencyKey,
        );
        if (concurrent) return concurrent;
      }
      throw error;
    }

    try {
      await this.notificationsPublisher.publishNotification({
        organizationId,
        userId,
        notification: {
          type: 'mcp_approval_pending',
          title: 'MCP Tool Approval Required',
          message: `MCP tool "${toolName}" requires approval`,
          metadata: {
            approvalId: approval.id,
            toolName,
          },
        },
      });
    } catch (error: unknown) {
      this.logger?.error('Failed to publish MCP approval notification', {
        approvalId: approval.id,
        error: (error as Error)?.message,
      });
    }

    return approval;
  }

  async findByOrganization(
    organizationId: string,
    status?: McpApprovalStatus,
  ): Promise<McpApprovalDocument[]> {
    const docs = await this.delegate.findMany({
      where: scopedWhere(organizationId, { ...(status ? { status } : {}) }),
      orderBy: { createdAt: 'desc' },
    });

    return docs as McpApprovalDocument[];
  }

  async resolve(
    id: string,
    organizationId: string,
    decision: 'approve' | 'decline',
    result?: Record<string, unknown>,
    apiKeyContext?: ApiKeyPublishingContext,
  ): Promise<McpApprovalDocument> {
    if (decision === 'approve') {
      const approval = await this.findOneWithOrganization(id, organizationId);
      if (isPublishingMcpApprovalTool(approval.toolName)) {
        assertApiKeyPublishingScope(apiKeyContext ?? {}, 'approve');
      }
    }

    const status =
      decision === 'approve'
        ? McpApprovalStatus.APPROVED
        : McpApprovalStatus.DECLINED;

    // Atomic claim: the PENDING status is part of the WHERE clause, so the
    // transition itself is the concurrency fence. Two callers racing to resolve
    // the same approval cannot both succeed — whoever flips PENDING first wins,
    // and the loser's updateMany matches 0 rows. This is what lets the MCP layer
    // safely gate tool execution on a successful resolve (no double-execution).
    const { count } = await this.delegate.updateMany({
      where: scopedWhere(organizationId, {
        id,
        status: McpApprovalStatus.PENDING,
      }),
      data: {
        status,
        resolvedAt: new Date(),
        ...(result !== undefined && { result }),
      },
    });

    if (count === 0) {
      // Either the approval does not exist / is cross-org, or it was already
      // resolved by a concurrent caller. Distinguish the two for a clear error.
      await this.findOneWithOrganization(id, organizationId);

      throw new BadRequestException('Approval already resolved');
    }

    return (await this.delegate.findFirst({
      where: scopedWhere(organizationId, { id }),
    })) as McpApprovalDocument;
  }

  async claimExecution(id: string, organizationId: string): Promise<boolean> {
    const { count } = await this.delegate.updateMany({
      where: scopedWhere(organizationId, {
        id,
        status: McpApprovalStatus.APPROVED,
        executionClaimedAt: null,
        result: { equals: Prisma.DbNull },
      }),
      data: { executionClaimedAt: new Date() },
    });
    return count === 1;
  }

  async attachResult(
    id: string,
    organizationId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    await this.delegate.updateMany({
      where: scopedWhere(organizationId, {
        id,
        status: McpApprovalStatus.APPROVED,
        result: { equals: Prisma.DbNull },
      }),
      data: { executedAt: new Date(), result },
    });
  }

  async findOwned(
    id: string,
    organizationId: string,
  ): Promise<McpApprovalDocument> {
    return this.findOneWithOrganization(id, organizationId);
  }

  async findActiveByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<McpApprovalDocument | null> {
    return (await this.delegate.findFirst({
      where: scopedWhere(organizationId, {
        idempotencyKey,
        status: {
          in: [McpApprovalStatus.APPROVED, McpApprovalStatus.PENDING],
        },
      }),
      orderBy: { createdAt: 'desc' },
    })) as McpApprovalDocument | null;
  }
}
