import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CreditEstimateQueryDto,
  ExecutePartialDto,
  PatchWorkflowNodesDto,
  ResumeExecutionDto,
  SubmitApprovalDto,
} from '@api/collections/workflows/dto/execute-workflow.dto';
import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowRunControlService } from '@api/collections/workflows/services/workflow-run-control.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { wrapError } from '@api/helpers/utils/controller/wrap-error.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import {
  WorkflowExecutionSerializer,
  WorkflowSerializer,
} from '@genfeedai/serializers';
import type { CreditEstimate } from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Workflow execution, review-gate approvals, and node locking endpoints. Split
 * out of the former monolithic `WorkflowsController`.
 *
 * Schedule, lifecycle, thumbnail, and marketplace-publish routes that used to
 * live here were collapsed into `PATCH /workflows/:id` by the REST audit
 * (#1354); node lock/unlock became `PATCH /workflows/:id/nodes`.
 */
@AutoSwagger()
@Controller('workflows')
@UseGuards(RolesGuard)
export class WorkflowExecutionController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowRunControlService: WorkflowRunControlService,
    private readonly workflowExecutionAuthorizationService: WorkflowExecutionAuthorizationService,
    private readonly workflowExecutorService: WorkflowExecutorService,
    readonly _loggerService: LoggerService,
  ) {}

  @Post(':workflowId/execute/partial')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async executePartial(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() dto: ExecutePartialDto,
    @CurrentUser() user: User,
  ): Promise<
    | JsonApiSingleResponse
    | { data: { runId: string; status: string; message: string } }
  > {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      const result = await this.workflowRunControlService.executePartial(
        workflowId,
        dto.nodeIds,
        publicMetadata.user,
        publicMetadata.organization,
        { dryRun: dto.dryRun, respectLocks: dto.respectLocks },
      );

      if (dto.dryRun) {
        return {
          data: result as { runId: string; status: string; message: string },
        };
      }

      return serializeSingle(request, WorkflowExecutionSerializer, result);
    }, 'Failed to execute partial workflow');
  }

  @Post(':workflowId/execute/resume/:runId')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resumeExecution(
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @Body() dto: ResumeExecutionDto,
    @CurrentUser() user: User,
  ): Promise<{ data: { runId: string; status: string; message: string } }> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      await this.workflowExecutionAuthorizationService.authorize({
        expectedContextVersion: dto.expectedContextVersion,
        organizationId: publicMetadata.organization,
        requestedBrandId: publicMetadata.brand || undefined,
        threadId: dto.threadId,
        userId: publicMetadata.user,
        workflowId,
      });
      const result = await this.workflowRunControlService.resumeFromFailed(
        workflowId,
        runId,
        publicMetadata.user,
        publicMetadata.organization,
      );

      return { data: result };
    }, 'Failed to resume workflow execution');
  }

  @Get(':workflowId/credits-estimate')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCreditsEstimate(
    @Param('workflowId') workflowId: string,
    @Query() query: CreditEstimateQueryDto,
    @CurrentUser() user: User,
  ): Promise<{ data: CreditEstimate }> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      const estimate = await this.workflowRunControlService.validateCredits(
        workflowId,
        publicMetadata.organization,
        query.nodeIds,
      );

      return { data: estimate };
    }, 'Failed to estimate credits');
  }

  @Get(':workflowId/executions/:runId/logs')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getExecutionLogs(
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: User,
  ): Promise<{ data: unknown }> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      const logs = await this.workflowRunControlService.getExecutionLogs(
        workflowId,
        runId,
        publicMetadata.organization,
      );

      return { data: logs };
    }, 'Failed to get execution logs');
  }

  @Post(':workflowId/executions/:executionId/approve')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async submitApproval(
    @Param('workflowId') workflowId: string,
    @Param('executionId') executionId: string,
    @Body() dto: SubmitApprovalDto,
    @CurrentUser() user: User,
  ): Promise<{
    data: {
      executionId: string;
      nodeId: string;
      status: 'approved' | 'rejected';
      approvedBy: string;
      approvedAt: string;
      rejectionReason?: string;
    };
  }> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      await this.workflowExecutionAuthorizationService.authorize({
        expectedContextVersion: dto.expectedContextVersion,
        organizationId: publicMetadata.organization,
        requestedBrandId: publicMetadata.brand || undefined,
        threadId: dto.threadId,
        userId: publicMetadata.user,
        workflowId,
      });
      const result =
        await this.workflowExecutorService.submitReviewGateApproval(
          workflowId,
          executionId,
          publicMetadata.user,
          publicMetadata.organization,
          dto.nodeId,
          dto.approved,
          dto.rejectionReason,
        );

      return { data: result };
    }, 'Failed to submit workflow approval');
  }

  /**
   * Lock and/or unlock workflow nodes. Collapsed from the former
   * `POST /workflows/:id/nodes/lock` and `/nodes/unlock` RPC routes (#1354):
   * `lock` adds node ids to the locked set, `unlock` removes them.
   */
  @Patch(':workflowId/nodes')
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async patchNodes(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() dto: PatchWorkflowNodesDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      });

      if (dto.lock && dto.lock.length > 0) {
        await this.workflowsService.lockNodes(
          workflowId,
          dto.lock,
          publicMetadata.organization,
        );
      }

      if (dto.unlock && dto.unlock.length > 0) {
        await this.workflowsService.unlockNodes(
          workflowId,
          dto.unlock,
          publicMetadata.organization,
        );
      }

      const workflow = await this.workflowsService.findOwnedOrThrow(
        workflowId,
        {
          organization: publicMetadata.organization,
          user: publicMetadata.user,
        },
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    }, 'Failed to update workflow node locks');
  }
}
