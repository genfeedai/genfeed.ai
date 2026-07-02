import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CreditEstimateQueryDto,
  ExecutePartialDto,
  LockNodesDto,
  ResumeExecutionDto,
  SubmitApprovalDto,
  UnlockNodesDto,
} from '@api/collections/workflows/dto/execute-workflow.dto';
import { SetThumbnailDto } from '@api/collections/workflows/dto/set-thumbnail.dto';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowRunControlService } from '@api/collections/workflows/services/workflow-run-control.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { wrapError } from '@api/helpers/utils/controller/wrap-error.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import {
  WorkflowExecutionSerializer,
  WorkflowSerializer,
} from '@genfeedai/serializers';
import type { CreditEstimate } from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Workflow execution, scheduling, lifecycle, review-gate approvals, node
 * locking and thumbnail endpoints. Split out of the former monolithic
 * `WorkflowsController`.
 */
@AutoSwagger()
@Controller('workflows')
export class WorkflowExecutionController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowRunControlService: WorkflowRunControlService,
    private readonly workflowExecutorService: WorkflowExecutorService,
    private readonly workflowSchedulerService: WorkflowSchedulerService,
    readonly _loggerService: LoggerService,
  ) {}

  @Post(':workflowId/schedule')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async setSchedule(
    @Param('workflowId') workflowId: string,
    @Body() body: { schedule: string; timezone?: string; enabled?: boolean },
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    // Update schedule and register/unregister cron job immediately
    const updated = await this.workflowSchedulerService.updateSchedule(
      workflowId,
      body.schedule,
      body.timezone || 'UTC',
      body.enabled !== false,
    );

    return updated
      ? ({
          data: { id: workflowId, message: 'Schedule updated' },
        } as unknown as JsonApiSingleResponse)
      : returnNotFound(this.constructorName, workflowId);
  }

  @Delete(':workflowId/schedule')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async removeSchedule(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    // Remove schedule and unregister cron job immediately
    const updated = await this.workflowSchedulerService.updateSchedule(
      workflowId,
      null, // null schedule removes it
      'UTC',
      false,
    );

    return updated
      ? ({
          data: { id: workflowId, message: 'Schedule removed' },
        } as unknown as JsonApiSingleResponse)
      : returnNotFound(this.constructorName, workflowId);
  }

  @Post(':workflowId/execute/partial')
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
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async resumeExecution(
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @Body() _dto: ResumeExecutionDto,
    @CurrentUser() user: User,
  ): Promise<{ data: { runId: string; status: string; message: string } }> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
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

  @Post(':workflowId/lifecycle/publish')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async publishWorkflowLifecycle(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      const workflow = await this.workflowsService.publishWorkflowLifecycle(
        workflowId,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    }, 'Failed to publish workflow');
  }

  @Post(':workflowId/lifecycle/archive')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async archiveWorkflow(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      const workflow = await this.workflowsService.archiveWorkflow(
        workflowId,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    }, 'Failed to archive workflow');
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

  @Post(':workflowId/nodes/lock')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async lockNodes(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() dto: LockNodesDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      });

      const workflow = await this.workflowsService.lockNodes(
        workflowId,
        dto.nodeIds,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    }, 'Failed to lock nodes');
  }

  @Post(':workflowId/nodes/unlock')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async unlockNodes(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() dto: UnlockNodesDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      });

      const workflow = await this.workflowsService.unlockNodes(
        workflowId,
        dto.nodeIds,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    }, 'Failed to unlock nodes');
  }

  @Patch(':workflowId/thumbnail')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async setThumbnail(
    @Req() request: Request,
    @Param('workflowId') workflowId: string,
    @Body() dto: SetThumbnailDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return wrapError(async () => {
      const publicMetadata = getPublicMetadata(user);
      await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      });

      const workflow = await this.workflowsService.setThumbnail(
        workflowId,
        dto.thumbnailUrl,
        dto.nodeId,
        publicMetadata.user,
        publicMetadata.organization,
      );

      return serializeSingle(request, WorkflowSerializer, workflow);
    }, 'Failed to set workflow thumbnail');
  }
}
