import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { CreateMcpApprovalDto } from '@api/collections/mcp-approvals/dto/create-mcp-approval.dto';
import { UpdateMcpApprovalDto } from '@api/collections/mcp-approvals/dto/update-mcp-approval.dto';
import type { McpApprovalDocument } from '@api/collections/mcp-approvals/schemas/mcp-approval.schema';
import {
  approvalGenerationQuote,
  readMcpApprovalPricing,
} from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import { McpApprovalPricingService } from '@api/collections/mcp-approvals/services/mcp-approval-pricing.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  type ApiKeyPublishingContext,
  assertApiKeyAgentPublishingScope,
  assertApiKeyPublishingScope,
  isPublishingMcpApprovalTool,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { assertMcpAccessModeAllowsTool } from '@api/helpers/utils/auth/mcp-access-mode.util';
import { scopedWhere } from '@api/index';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { getToolByName } from '@genfeedai/actions';
import { buildLogicalWriteKey } from '@genfeedai/actions/server';
import { ActivityKey, ActivitySource, MemberRole } from '@genfeedai/contracts';
import { McpApprovalStatus, Prisma, toPrismaJson } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';

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
    private readonly activityRecorder: ActivityRecorderService,
    @Optional() private readonly brandAccess?: BrandAccessService,
    @Optional() private readonly pricing?: McpApprovalPricingService,
  ) {
    super(prisma, 'mcpApproval', logger);
  }

  async createPending(
    organizationId: string,
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: {
      threadId?: string;
      scope?: { brandId?: string; contextVersion: number };
      generationContext?: Pick<
        ToolExecutionContext,
        'generationSettings' | 'generationModelOverride' | 'attachmentUrls'
      >;
    },
  ): Promise<McpApprovalDocument> {
    const needsGenerationQuote =
      toolName === 'generate' &&
      (args.type === 'image' || args.type === 'video');
    const idempotencyKey = buildLogicalWriteKey({
      arguments: args,
      organizationId,
      threadId: options?.threadId,
      scope: options?.scope,
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
      if (
        needsGenerationQuote &&
        !readMcpApprovalPricing(existing.pricingQuote)
      ) {
        throw new BadRequestException(
          'This generation approval has no verified quote. Decline it and request fresh consent with a supported model and complete settings.',
        );
      }
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

    if (needsGenerationQuote && !this.pricing) {
      throw new BadRequestException(
        'Model-specific approval pricing is unavailable.',
      );
    }
    const pricingQuote = await this.pricing?.prepare(toolName, args, {
      ...options?.generationContext,
      organizationId,
      userId,
    });
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
          ...(pricingQuote ? { pricingQuote: toPrismaJson(pricingQuote) } : {}),
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
        if (concurrent) {
          if (
            needsGenerationQuote &&
            !readMcpApprovalPricing(concurrent.pricingQuote)
          ) {
            throw new BadRequestException(
              'The concurrent generation approval has no verified quote. Request fresh consent.',
            );
          }
          return concurrent;
        }
      }
      throw error;
    }

    try {
      // The alert policy puts the request in the requester's bell.
      await this.activityRecorder.record({
        alert: {
          deduplicationKey: `${ActivityKey.MCP_APPROVAL_REQUESTED}/${approval.id}`,
          source: { id: approval.id, type: 'mcp_approval' },
        },
        data: { approvalId: approval.id, toolName },
        entityId: approval.id,
        entityModel: 'McpApproval',
        key: ActivityKey.MCP_APPROVAL_REQUESTED,
        organizationId,
        source: ActivitySource.MCP_APPROVAL,
        userId,
        value: toolName,
      });
    } catch (error: unknown) {
      this.logger?.error('Failed to publish MCP approval notification', {
        approvalId: approval.id,
        error: (error as Error)?.message,
      });
    }

    return approval;
  }

  /** Replace a pending consent identity without approving or executing it.
   * The caller holds the thread lock and patches its cards in this transaction.
   * Invalidating the old ID prevents stale clients from approving the renewal.
   */
  async replacePending(
    approval: McpApprovalDocument,
    transaction: Prisma.TransactionClient,
  ): Promise<McpApprovalDocument> {
    const { count } = await transaction.mcpApproval.updateMany({
      where: scopedWhere(approval.organizationId, {
        id: approval.id,
        userId: approval.userId,
        toolName: approval.toolName,
        idempotencyKey: approval.idempotencyKey,
        arguments: { equals: toPrismaJson(approval.arguments) },
        status: McpApprovalStatus.PENDING,
      }),
      data: {
        status: McpApprovalStatus.DECLINED,
        resolvedAt: new Date(),
        result: { reason: 'superseded_by_fresh_preview' },
      },
    });
    if (count !== 1) throw new BadRequestException('Approval already resolved');
    // Pending count is unchanged, and the active-key uniqueness fence applies.
    return (await transaction.mcpApproval.create({
      data: {
        arguments: toPrismaJson(approval.arguments),
        ...(approval.pricingQuote
          ? { pricingQuote: toPrismaJson(approval.pricingQuote) }
          : {}),
        idempotencyKey: approval.idempotencyKey,
        organizationId: approval.organizationId,
        userId: approval.userId,
        toolName: approval.toolName,
        status: McpApprovalStatus.PENDING,
      },
    })) as McpApprovalDocument;
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

  async findStatusForActor(
    id: string,
    user: AuthenticatedUser,
  ): Promise<McpApprovalDocument> {
    const userId = user.userId || user.id;
    if (!userId || !user.organizationId || !this.brandAccess)
      throw new ForbiddenException();
    const approval = (await this.delegate.findFirst({
      where: scopedWhere(user.organizationId, { id, userId }),
    })) as McpApprovalDocument | null;
    if (!approval) throw new NotFoundException('MCP approval');

    const tool = getToolByName(approval.toolName);
    if (!tool?.surfaces.mcp) throw new NotFoundException('MCP approval');
    assertMcpAccessModeAllowsTool(user, approval.toolName, 'mcp');
    const args = isRecord(approval.arguments) ? approval.arguments : {};
    assertApiKeyAgentPublishingScope(user, approval.toolName, args);
    const actor = { ...user, userId };
    const { role } = await this.brandAccess.resolve(actor);
    if (
      (tool.requiredRole === 'admin' &&
        role !== MemberRole.OWNER &&
        role !== MemberRole.ADMIN) ||
      (tool.requiredRole === 'superadmin' && user.isSuperAdmin !== true)
    )
      throw new ForbiddenException();
    const approvalBrand =
      typeof args.brandId === 'string' ? args.brandId : undefined;
    if (user.isApiKey && user.brandId && approvalBrand !== user.brandId) {
      throw new ForbiddenException(
        'Approval brand is outside the connected key scope',
      );
    }
    for (const brandId of new Set(
      [user.brandId, approvalBrand].filter((brandId): brandId is string =>
        Boolean(brandId),
      ),
    )) {
      await this.brandAccess.assert(actor, brandId);
    }
    return approval;
  }

  async findPricingForActor(id: string, user: AuthenticatedUser) {
    const approval = await this.findStatusForActor(id, user);
    const quote = approvalGenerationQuote(approval.pricingQuote);
    return {
      id: approval.id,
      estimatedCredits: quote?.credits ?? null,
      modelKey: quote?.modelKey ?? null,
      quoteStatus: quote ? 'available' : 'unavailable',
    };
  }

  async resolve(
    id: string,
    organizationId: string,
    decision: 'approve' | 'decline',
    result?: Record<string, unknown>,
    apiKeyContext?: ApiKeyPublishingContext,
    transaction?: Prisma.TransactionClient,
  ): Promise<McpApprovalDocument> {
    const delegate = transaction?.mcpApproval ?? this.delegate;
    const findOwned = async () => {
      if (!transaction) return this.findOneWithOrganization(id, organizationId);
      const approval = await delegate.findFirst({
        where: scopedWhere(organizationId, { id }),
      });
      if (!approval) {
        throw new NotFoundException(`${this.constructor.name} not found`);
      }
      return approval;
    };
    if (decision === 'approve') {
      const approval = await findOwned();
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
    const { count } = await delegate.updateMany({
      where: scopedWhere(organizationId, {
        id,
        status: McpApprovalStatus.PENDING,
      }),
      data: {
        status,
        resolvedAt: new Date(),
        ...(result !== undefined && { result: toPrismaJson(result) }),
      },
    });

    if (count === 0) {
      // Either the approval does not exist / is cross-org, or it was already
      // resolved by a concurrent caller. Distinguish the two for a clear error.
      await findOwned();

      throw new BadRequestException('Approval already resolved');
    }

    return (await delegate.findFirst({
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
