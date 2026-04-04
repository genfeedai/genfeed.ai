import { CreateWorkspaceTaskDto } from '@api/collections/workspace-tasks/dto/create-workspace-task.dto';
import { UpdateWorkspaceTaskDto } from '@api/collections/workspace-tasks/dto/update-workspace-task.dto';
import {
  WorkspaceTaskDismissDto,
  WorkspaceTaskRequestChangesDto,
} from '@api/collections/workspace-tasks/dto/workspace-task-action.dto';
import {
  WORKSPACE_TASK_VIEWS,
  WorkspaceTasksQueryDto,
} from '@api/collections/workspace-tasks/dto/workspace-tasks-query.dto';
import {
  WorkspaceTask,
  type WorkspaceTaskDocument,
} from '@api/collections/workspace-tasks/schemas/workspace-task.schema';
import { WorkspaceTasksService } from '@api/collections/workspace-tasks/services/workspace-tasks.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { WorkspaceTaskQueueService } from '@api/services/task-orchestration/workspace-task-queue.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { WorkspaceTaskSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

@ApiTags('Workspace Tasks')
@AutoSwagger()
@Controller('workspace-tasks')
export class WorkspaceTasksController extends BaseCRUDController<
  WorkspaceTaskDocument,
  CreateWorkspaceTaskDto,
  UpdateWorkspaceTaskDto,
  WorkspaceTasksQueryDto
> {
  constructor(
    public readonly workspaceTasksService: WorkspaceTasksService,
    public readonly loggerService: LoggerService,
    private readonly agentOrchestratorService: AgentOrchestratorService,
    @Optional()
    private readonly workspaceTaskQueueService?: WorkspaceTaskQueueService,
  ) {
    super(
      loggerService,
      workspaceTasksService,
      WorkspaceTaskSerializer,
      WorkspaceTask.name,
      ['organization', 'brand', 'user'],
    );
  }

  /**
   * Override create to enqueue the task for orchestration after persisting.
   */
  @Post()
  override async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateWorkspaceTaskDto,
  ): Promise<JsonApiSingleResponse> {
    const response = await super.create(request, user, createDto);

    // Fire-and-forget: enqueue for orchestration
    if (this.workspaceTaskQueueService) {
      const publicMetadata = getPublicMetadata(user);
      const taskId = (response.data as { id?: string })?.id;

      if (taskId && publicMetadata.organization) {
        this.workspaceTaskQueueService
          .enqueue({
            brandId: createDto.brand,
            organizationId: publicMetadata.organization,
            outputType: createDto.outputType,
            platforms: createDto.platforms,
            request: createDto.request,
            taskId,
            userId: publicMetadata.user,
          })
          .catch((error: unknown) => {
            this.loggerService.error(
              'WorkspaceTasksController: Failed to enqueue task for orchestration',
              error,
            );
          });
      }
    }

    return response;
  }

  public override buildFindAllPipeline(
    user: User,
    query: WorkspaceTasksQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    if (publicMetadata.organization) {
      match.organization = new Types.ObjectId(publicMetadata.organization);
    } else if (publicMetadata.user) {
      match.user = new Types.ObjectId(publicMetadata.user);
    }

    if (query.status) {
      match.status = query.status;
    }

    if (query.reviewState) {
      match.reviewState = query.reviewState;
    }

    if (query.view === 'in_progress') {
      match.status = { $in: ['triaged', 'in_progress'] };
    }

    if (query.view === 'inbox') {
      match.$or = [
        { reviewState: { $in: ['pending_approval', 'changes_requested'] } },
        { status: { $in: ['completed', 'failed'] } },
      ];
    }

    const sort =
      query.view && WORKSPACE_TASK_VIEWS.includes(query.view)
        ? { updatedAt: -1 }
        : handleQuerySort(query.sort);

    return [{ $match: match }, { $sort: sort }];
  }

  public override canUserModifyEntity(
    user: User,
    entity: WorkspaceTaskDocument,
  ): boolean {
    const publicMetadata = getPublicMetadata(user);
    const entityOrganizationId =
      (
        entity.organization as unknown as { _id?: Types.ObjectId }
      )?._id?.toString() || entity.organization?.toString();

    return entityOrganizationId === publicMetadata.organization;
  }

  @Get('inbox')
  async inbox(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const docs = await this.workspaceTasksService.listInbox(
      organization,
      limit ? Number(limit) : undefined,
    );

    return serializeCollection(request, WorkspaceTaskSerializer, { docs });
  }

  @Patch(':id/approve')
  async approve(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const doc = await this.workspaceTasksService.approve(id, organization);
    return serializeSingle(request, WorkspaceTaskSerializer, doc);
  }

  @Patch(':id/request-changes')
  async requestChanges(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: WorkspaceTaskRequestChangesDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const doc = await this.workspaceTasksService.requestChanges(
      id,
      organization,
      body.reason,
    );
    return serializeSingle(request, WorkspaceTaskSerializer, doc);
  }

  @Patch(':id/dismiss')
  async dismiss(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: WorkspaceTaskDismissDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const doc = await this.workspaceTasksService.dismiss(
      id,
      organization,
      body.reason,
    );
    return serializeSingle(request, WorkspaceTaskSerializer, doc);
  }

  @Post(':id/plan-thread')
  async openPlanThread(@CurrentUser() user: User, @Param('id') id: string) {
    const { organization, user: metadataUserId } = getPublicMetadata(user);

    if (!metadataUserId || !Types.ObjectId.isValid(metadataUserId)) {
      throw new UnauthorizedException(
        'Missing workspace user context. Please sign in again.',
      );
    }

    const planThread = await this.workspaceTasksService.openPlanningThread(
      id,
      organization,
      metadataUserId,
    );

    if (planThread.seeded) {
      const prompt = await this.workspaceTasksService.getPlanningPrompt(
        id,
        organization,
      );

      await this.agentOrchestratorService.chat(
        {
          content: prompt,
          planModeEnabled: true,
          source: 'agent',
          threadId: planThread.threadId,
        },
        {
          organizationId: organization,
          userId: metadataUserId,
        },
      );
    }

    return planThread;
  }

  @Post(':id/follow-up-tasks')
  async createFollowUpTasks(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const { organization, user: metadataUserId } = getPublicMetadata(user);

    if (!metadataUserId || !Types.ObjectId.isValid(metadataUserId)) {
      throw new UnauthorizedException(
        'Missing workspace user context. Please sign in again.',
      );
    }

    const tasks = await this.workspaceTasksService.createFollowUpTasks(
      id,
      organization,
      metadataUserId,
    );

    if (this.workspaceTaskQueueService) {
      await Promise.all(
        tasks.map((task) =>
          this.workspaceTaskQueueService.enqueue({
            brandId: task.brand?.toString(),
            organizationId: organization,
            outputType: task.outputType,
            platforms: task.platforms,
            request: task.request,
            taskId: task._id.toString(),
            userId: metadataUserId,
          }),
        ),
      );
    }

    return serializeCollection(request, WorkspaceTaskSerializer, {
      docs: tasks,
    });
  }
}
