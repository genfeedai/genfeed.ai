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
  type IReviewInboxDecisionRequest,
  type IReviewInboxDecisionResult,
  parseReviewInboxItemId,
} from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Resolves a review inbox item through the service that owns its gate. Each
 * owner fences its own transition (the review-gate lease, the MCP approval's
 * PENDING claim), so a second decision on the same item fails instead of
 * recording twice.
 */
@Injectable()
export class ReviewInboxDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly workflowExecutor: WorkflowExecutorService,
    private readonly mcpApprovals: McpApprovalsService,
    private readonly moduleAccess: OrganizationModuleAccessService,
  ) {}

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
