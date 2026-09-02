import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { TaskQueryDto } from '@api/collections/tasks/dto/task-query.dto';
import { UpdateTaskDto } from '@api/collections/tasks/dto/update-task.dto';
import { UpdateTaskOutputDto } from '@api/collections/tasks/dto/update-task-output.dto';
import { type TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { scopedWhere } from '@api/index';
import { WorkspaceTaskWorkflowQueueService } from '@api/services/task-orchestration/workspace-task-workflow-queue.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/interfaces';
import { TaskSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Tasks')
@AutoSwagger()
@Controller('tasks')
export class TasksController extends BaseCRUDController<
  TaskDocument,
  CreateTaskDto,
  UpdateTaskDto,
  TaskQueryDto
> {
  constructor(
    public readonly loggerService: LoggerService,
    private readonly tasksService: TasksService,
    private readonly taskCountersService: TaskCountersService,
    private readonly organizationsService: OrganizationsService,
    @Optional()
    private readonly workspaceTaskWorkflowQueue?: WorkspaceTaskWorkflowQueueService,
  ) {
    super(loggerService, tasksService, TaskSerializer, 'Task');
  }

  @Post()
  override async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateTaskDto,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = user.organizationId;
    const brandId = createDto.brandId ?? user.brandId;

    const org = await this.organizationsService.findOne({
      id: organizationId,
    });

    if (!org?.prefix) {
      throw new BadRequestException(
        'Organization must have a prefix set before creating tasks',
      );
    }

    const taskNumber =
      await this.taskCountersService.getNextNumber(organizationId);
    const identifier = `${org.prefix}-${taskNumber}`;
    const extended = createDto as CreateTaskDto & {
      elevenlabsVoiceId?: string;
      heygenAvatarId?: string;
      outputType?: string;
      platforms?: string[];
      request?: string;
      voiceId?: string;
      voiceProvider?: string;
    };

    const doc = await this.tasksService.create({
      ...createDto,
      brandId,
      identifier,
      organizationId: organizationId,
      taskNumber,
      userId: user.userId ?? user.id,
    } as CreateTaskDto & {
      brandId?: string;
      identifier: string;
      organizationId: string;
      taskNumber: number;
      userId: string;
    });

    const response = serializeSingle(request, TaskSerializer, doc);

    // Fire-and-forget: enqueue AI tasks for orchestration
    if (this.workspaceTaskWorkflowQueue && extended.request) {
      const taskId = (response.data as { id?: string })?.id;

      if (taskId) {
        this.tasksService
          .recordTaskEvent(taskId, organizationId, user.userId ?? user.id, {
            payload: {
              executionPathUsed: doc.executionPathUsed,
              outputType: doc.outputType,
              request: extended.request,
            },
            type: 'task_queued',
          })
          .catch((error: unknown) => {
            this.loggerService.error(
              'TasksController: Failed to publish queued task event',
              error,
            );
          });

        this.workspaceTaskWorkflowQueue
          .enqueue({
            brandId,
            elevenlabsVoiceId: extended.elevenlabsVoiceId,
            heygenAvatarId: extended.heygenAvatarId,
            organizationId,
            outputType: extended.outputType,
            platforms: extended.platforms,
            request: extended.request,
            taskId,
            userId: user.userId ?? user.id,
            voiceId: extended.voiceId,
            voiceProvider: extended.voiceProvider,
          })
          .catch((error: unknown) => {
            this.loggerService.error(
              'TasksController: Failed to enqueue task for orchestration',
              error,
            );
          });
      }
    }

    return response;
  }

  public override buildFindAllQuery(user: User, query: TaskQueryDto) {
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
      organizationId: user.organizationId,
    };

    // Optional brand filter from the request only. Omit for org-wide inbox
    // (all brands under the org). Session brand must not force a filter —
    // brand-less `/~/workspace/inbox` is intentionally cross-brand.
    if (query.brandId) {
      match.brandId = query.brandId;
    }

    if (query.status) {
      match.status = query.status;
    }

    if (query.priority) {
      match.priority = query.priority;
    }

    if (query.assigneeUserId) {
      match.assigneeUserId = query.assigneeUserId;
    }

    if (query.assigneeAgentId) {
      match.assigneeAgentId = query.assigneeAgentId;
    }

    if (query.parentId) {
      match.parentId = query.parentId;
    }

    if (query.projectId) {
      match.projectId = query.projectId;
    }

    if (query.goalId) {
      match.goalId = query.goalId;
    }

    if (query.reviewState) {
      match.reviewState = query.reviewState;
    }

    if (query.view === 'in_progress') {
      match.status = { in: ['backlog', 'in_progress'] };
    }

    if (query.view === 'inbox') {
      match.OR = [
        { reviewState: { in: ['pending_approval', 'changes_requested'] } },
        { status: { in: ['done', 'failed'] } },
      ];
    }

    // Numeric direction (1 = asc, -1 = desc); the BaseService query normalizer
    // maps these to Prisma values. Array form preserves reviewState asc, then
    // updatedAt desc, matching the legacy /inbox route.
    // The explicit SortObject[] annotation stops TS from widening the mixed-key
    // array literal to a `{ key: dir; other?: undefined }` union that would break
    // the Record index signature on the base buildFindAllQuery return type.
    const sort: SortObject | SortObject[] =
      query.view === 'inbox'
        ? [{ reviewState: 1 }, { updatedAt: -1 }]
        : query.view === 'in_progress'
          ? { updatedAt: -1 }
          : handleQuerySort(query.sort);

    return {
      orderBy: sort,
      where: match,
    };
  }

  public override canUserModifyEntity(
    user: User,
    entity: TaskDocument,
  ): boolean {
    // Both ids must exist: `undefined === undefined` granted write access.
    const userOrgId = user.organizationId;
    return Boolean(userOrgId) && entity.organizationId === userOrgId;
  }

  @Get('by-identifier/:identifier')
  async findByIdentifier(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('identifier') identifier: string,
  ) {
    const organization = user.organizationId;
    const doc = await this.tasksService.findByIdentifier(
      identifier,
      organization,
    );
    if (!doc) {
      throw new NotFoundException('Task', identifier);
    }
    return serializeSingle(request, TaskSerializer, doc);
  }

  @Get(':id')
  override async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const organization = user.organizationId;
    const doc = await this.tasksService.findOne(
      scopedWhere(organization, { id: id }),
    );

    if (!doc) {
      throw new NotFoundException('Task');
    }

    return serializeSingle(request, TaskSerializer, doc);
  }

  @Get(':id/children')
  async findChildren(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiCollectionResponse> {
    const children = await this.tasksService.findChildren(
      id,
      user.organizationId,
    );
    return serializeCollection(request, TaskSerializer, {
      docs: children,
      totalDocs: children.length,
    });
  }

  @Patch(':id')
  override async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateTaskDto,
  ): Promise<JsonApiSingleResponse> {
    // Review transitions route through the dedicated action methods, which carry
    // the load-bearing side effects (event stream, realtime broadcast, feedback
    // memory) — rather than a plain field write.
    if (updateDto.reviewState) {
      return this.applyReviewTransition(request, user, id, updateDto);
    }

    const result = await super.patch(request, user, id, updateDto);

    // When a task is marked done/cancelled, check if parent's children are all complete
    if (updateDto.status === 'done' || updateDto.status === 'cancelled') {
      const task = await this.tasksService.findOne({
        id: id,
      });

      if (task?.parentId) {
        const parentId = task.parentId.toString();
        const allDone = await this.tasksService.areAllChildrenDone(
          parentId,
          user.organizationId,
        );

        if (allDone) {
          this.loggerService.log(
            `All children of task ${parentId} are complete — parent ready for review`,
          );
        }
      }
    }

    return result;
  }

  /**
   * Apply a review transition (approve/request-changes/dismiss) driven by the
   * `reviewState` field on a `PATCH /tasks/:id`. The transition is exclusive —
   * it cannot be combined with other field updates.
   */
  private async applyReviewTransition(
    request: Request,
    user: User,
    id: string,
    updateDto: UpdateTaskDto,
  ): Promise<JsonApiSingleResponse> {
    const { reviewState, reason, ...rest } = updateDto;
    if (Object.keys(rest).length > 0) {
      throw new BadRequestException(
        'A reviewState transition cannot be combined with other field updates.',
      );
    }

    const organization = user.organizationId;
    const userId = user.userId ?? user.id;

    let doc: TaskDocument;
    switch (reviewState) {
      case 'approved':
        doc = await this.tasksService.approve(id, organization, userId);
        break;
      case 'changes_requested':
        doc = await this.tasksService.requestChanges(
          id,
          organization,
          userId,
          reason ?? '',
        );
        break;
      case 'dismissed':
        doc = await this.tasksService.dismiss(id, organization, userId, reason);
        break;
      default:
        throw new BadRequestException('Unsupported reviewState transition.');
    }

    return serializeSingle(request, TaskSerializer, doc);
  }

  /**
   * Keep or un-keep a task output. `isKept: true` marks the output as an
   * approved keeper; `false` reverts it.
   */
  @Patch(':id/outputs/:outputId')
  async setOutputKept(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('outputId') outputId: string,
    @Body() body: UpdateTaskOutputDto,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    const doc = body.isKept
      ? await this.tasksService.keepOutput(id, outputId, organization, userId)
      : await this.tasksService.unkeepOutput(id, outputId, organization);
    return serializeSingle(request, TaskSerializer, doc);
  }

  /**
   * Trash (soft-delete) a task output.
   */
  @Delete(':id/outputs/:outputId')
  async trashOutput(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('outputId') outputId: string,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    const doc = await this.tasksService.trashOutput(
      id,
      outputId,
      organization,
      userId,
    );
    return serializeSingle(request, TaskSerializer, doc);
  }

  @Post(':id/checkout')
  @HttpCode(HttpStatus.OK)
  async checkout(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { agentId: string; runId: string },
  ) {
    if (!body.agentId || !body.runId) {
      throw new BadRequestException('agentId and runId are required');
    }

    const organization = user.organizationId;
    const doc = await this.tasksService.checkout(
      id,
      body.agentId,
      body.runId,
      organization,
    );

    if (!doc) {
      throw new ConflictException(
        'Task is already checked out by another agent',
      );
    }

    return serializeSingle(request, TaskSerializer, doc);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  async release(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { agentId: string },
  ) {
    if (!body.agentId) {
      throw new BadRequestException('agentId is required');
    }

    const organization = user.organizationId;
    const doc = await this.tasksService.release(id, body.agentId, organization);
    return serializeSingle(request, TaskSerializer, doc);
  }
}
