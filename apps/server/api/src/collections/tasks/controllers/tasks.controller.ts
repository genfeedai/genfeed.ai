import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { TaskQueryDto } from '@api/collections/tasks/dto/task-query.dto';
import { UpdateTaskDto } from '@api/collections/tasks/dto/update-task.dto';
import {
  Task,
  type TaskDocument,
} from '@api/collections/tasks/schemas/task.schema';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { TaskSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

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
  ) {
    super(loggerService, tasksService, TaskSerializer, Task.name);
  }

  @Post()
  override async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateTaskDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const org = await this.organizationsService.findOne({
      _id: new Types.ObjectId(organizationId),
      isDeleted: false,
    });

    if (!org?.prefix) {
      throw new BadRequestException(
        'Organization must have a prefix set before creating tasks',
      );
    }

    const taskNumber =
      await this.taskCountersService.getNextNumber(organizationId);
    const identifier = `${org.prefix}-${taskNumber}`;

    const doc = await this.tasksService.create({
      ...createDto,
      identifier,
      organization: new Types.ObjectId(organizationId),
      taskNumber,
    } as CreateTaskDto & {
      identifier: string;
      taskNumber: number;
      organization: Types.ObjectId;
    });

    return serializeSingle(request, TaskSerializer, doc);
  }

  public override buildFindAllPipeline(
    user: User,
    query: TaskQueryDto,
  ): PipelineStage[] {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
      organization: new Types.ObjectId(publicMetadata.organization),
    };

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
      match.parentId = new Types.ObjectId(query.parentId);
    }

    if (query.projectId) {
      match.projectId = query.projectId;
    }

    if (query.goalId) {
      match.goalId = query.goalId;
    }

    const sort = handleQuerySort(query.sort);

    return [{ $match: match }, { $sort: sort }];
  }

  public override canUserModifyEntity(
    user: User,
    entity: TaskDocument,
  ): boolean {
    const publicMetadata = getPublicMetadata(user);
    const entityOrganizationId =
      (
        entity.organization as unknown as { _id?: Types.ObjectId }
      )?._id?.toString() || entity.organization?.toString();

    return entityOrganizationId === publicMetadata.organization;
  }

  @Get('by-identifier/:identifier')
  async findByIdentifier(
    @Req() request: Request,
    @Param('identifier') identifier: string,
  ) {
    const doc = await this.tasksService.findByIdentifier(identifier);
    if (!doc) {
      throw new NotFoundException(`Task ${identifier} not found`);
    }
    return serializeSingle(request, TaskSerializer, doc);
  }

  @Get(':id/children')
  async findChildren(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const children = await this.tasksService.findChildren(
      id,
      publicMetadata.organization,
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
    const result = await super.patch(request, user, id, updateDto);

    // When a task is marked done/cancelled, check if parent's children are all complete
    if (updateDto.status === 'done' || updateDto.status === 'cancelled') {
      const task = await this.tasksService.findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
      });

      if (task?.parentId) {
        const parentId = task.parentId.toString();
        const publicMetadata = getPublicMetadata(user);
        const allDone = await this.tasksService.areAllChildrenDone(
          parentId,
          publicMetadata.organization,
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

  @Post(':id/checkout')
  @HttpCode(HttpStatus.OK)
  async checkout(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: { agentId: string; runId: string },
  ) {
    if (!body.agentId || !body.runId) {
      throw new BadRequestException('agentId and runId are required');
    }

    const doc = await this.tasksService.checkout(id, body.agentId, body.runId);

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
    @Param('id') id: string,
    @Body() body: { agentId: string },
  ) {
    if (!body.agentId) {
      throw new BadRequestException('agentId is required');
    }

    const doc = await this.tasksService.release(id, body.agentId);
    return serializeSingle(request, TaskSerializer, doc);
  }
}
