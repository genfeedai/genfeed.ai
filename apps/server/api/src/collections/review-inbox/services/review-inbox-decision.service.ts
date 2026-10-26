import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { McpApprovalsService } from '@api/collections/mcp-approvals/services/mcp-approvals.service';
import type { ReviewInboxViewerAccess } from '@api/collections/review-inbox/review-inbox.types';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  type IReviewInboxBatchDecisionRequest,
  type IReviewInboxBatchDecisionResult,
  type IReviewInboxDecisionRequest,
  type IReviewInboxDecisionResult,
  parseReviewInboxItemId,
} from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';

/**
 * Resolves a review inbox item through the service that owns its gate. Each
 * owner fences its own transition (the review-gate lease, the MCP approval's
 * PENDING claim), so a second decision on the same item fails instead of
 * recording twice.
 */
@Injectable()
export class ReviewInboxDecisionService {
  private readonly logger = new Logger(ReviewInboxDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly workflowExecutor: WorkflowExecutorService,
    private readonly mcpApprovals: McpApprovalsService,
    private readonly moduleAccess: OrganizationModuleAccessService,
  ) {}

  /**
   * Decides every item through `decide`, so tenant scoping, brand access and
   * role checks apply per item. One item failing never aborts the rest; the
   * failure is reported beside the items that did resolve. Only HTTP
   * exceptions carry client-safe text; anything else (Prisma, runtime errors)
   * is logged and reported as a generic message, as the exception filters do
   * for the single-item route.
   */
  async decideMany(
    user: AuthenticatedUser,
    access: ReviewInboxViewerAccess,
    request: IReviewInboxBatchDecisionRequest,
  ): Promise<IReviewInboxBatchDecisionResult> {
    const result: IReviewInboxBatchDecisionResult = {
      decided: [],
      failed: [],
    };
    for (const itemId of request.itemIds) {
      try {
        result.decided.push(
          await this.decide(user, access, {
            decision: request.decision,
            itemId,
            reason: request.reason,
          }),
        );
      } catch (error) {
        if (!(error instanceof HttpException)) {
          this.logger.error(
            `Batch decision failed for ${itemId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
        result.failed.push({
          itemId,
          message:
            error instanceof HttpException ? error.message : 'Decision failed',
        });
      }
    }
    return result;
  }

  async decide(
    user: AuthenticatedUser,
    access: ReviewInboxViewerAccess,
    request: IReviewInboxDecisionRequest,
  ): Promise<IReviewInboxDecisionResult> {
    const parsed = parseReviewInboxItemId(request.itemId);
    if (!parsed) {
      throw new BadRequestException('Unknown review inbox item');
    }
    const organizationId = user.organizationId;
    const userId = user.userId ?? user.id;
    const isApproved = request.decision === 'approve';

    if (parsed.kind === 'mcp_approval') {
      if (!access.canResolveMcpApprovals) {
        throw new ForbiddenException(
          'Only organization owners and admins can resolve MCP approvals',
        );
      }
      const approval = await this.mcpApprovals.resolve(
        parsed.approvalId,
        organizationId,
        isApproved ? 'approve' : 'decline',
        undefined,
        user,
      );
      return {
        decision: request.decision,
        id: request.itemId,
        itemId: request.itemId,
        kind: parsed.kind,
        resolvedAt: (approval.resolvedAt ?? new Date()).toISOString(),
        status: isApproved ? 'approved' : 'rejected',
      };
    }

    if (!access.canResolveWorkflowGates) {
      throw new ForbiddenException(
        'Only organization owners, admins and creators can resolve workflow review gates',
      );
    }
    const execution = await this.prisma.workflowExecution.findFirst({
      select: {
        workflow: { select: { brandId: true } },
        workflowId: true,
      },
      where: scopedWhere(organizationId, { id: parsed.executionId }),
    });
    if (!execution) {
      throw new NotFoundException('Workflow review gate');
    }
    if (execution.workflow.brandId) {
      await this.brandAccess.assert(
        {
          apiKeyId: user.apiKeyId,
          isApiKey: user.isApiKey,
          organizationId,
          scopes: user.scopes,
          userId,
        },
        execution.workflow.brandId,
      );
    }
    // Approval resumes the run; rejection only closes it, so it stays open
    // even when automation is no longer available to the organization.
    if (isApproved) {
      await this.moduleAccess.assertAccess(organizationId, 'automation');
    }
    const result = await this.workflowExecutor.submitReviewGateApproval(
      execution.workflowId,
      parsed.executionId,
      userId,
      organizationId,
      parsed.nodeId,
      isApproved,
      request.reason,
    );
    return {
      decision: request.decision,
      id: request.itemId,
      itemId: request.itemId,
      kind: parsed.kind,
      resolvedAt: result.approvedAt,
      status: result.status,
    };
  }
}
