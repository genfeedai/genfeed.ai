import { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '@api/collections/tasks/dto/update-task.dto';
import {
  Task,
  type TaskDocument,
  type TaskStatus,
} from '@api/collections/tasks/schemas/task.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/**
 * Valid status transitions for task lifecycle.
 * Key = current status, Value = set of allowed next statuses.
 */
const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ['todo', 'in_progress', 'cancelled'],
  blocked: ['todo', 'in_progress', 'cancelled'],
  cancelled: ['backlog', 'todo'],
  done: ['in_progress'],
  failed: ['backlog', 'in_progress'],
  in_progress: ['blocked', 'in_review', 'done', 'failed', 'cancelled'],
  in_review: ['in_progress', 'done', 'cancelled'],
  todo: ['in_progress', 'blocked', 'backlog', 'cancelled'],
};

@Injectable()
export class TasksService extends BaseService<
  TaskDocument,
  CreateTaskDto,
  UpdateTaskDto
> {
  constructor(
    @InjectModel(Task.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<TaskDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  override async create(createDto: CreateTaskDto): Promise<TaskDocument> {
    return super.create(createDto);
  }

  override async findOne(
    params: Record<string, unknown>,
  ): Promise<TaskDocument | null> {
    return super.findOne(params);
  }

  override async patch(
    id: string,
    updateDto: UpdateTaskDto | Record<string, unknown>,
  ): Promise<TaskDocument> {
    const newStatus = (updateDto as Record<string, unknown>).status as
      | TaskStatus
      | undefined;

    if (newStatus) {
      const existing = await super.findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
      });

      if (existing) {
        this.validateStatusTransition(existing.status, newStatus);
      }
    }

    return super.patch(id, updateDto);
  }

  async findByIdentifier(identifier: string): Promise<TaskDocument | null> {
    return this.model.findOne({
      identifier,
      isDeleted: false,
    });
  }

  async findChildren(
    taskId: string,
    organizationId: string,
  ): Promise<TaskDocument[]> {
    return this.model.find({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      parentId: new Types.ObjectId(taskId),
    });
  }

  async areAllChildrenDone(
    taskId: string,
    organizationId: string,
  ): Promise<boolean> {
    const children = await this.findChildren(taskId, organizationId);
    if (children.length === 0) return false;
    return children.every(
      (child) => child.status === 'done' || child.status === 'cancelled',
    );
  }

  async checkout(
    taskId: string,
    agentId: string,
    runId: string,
  ): Promise<TaskDocument | null> {
    const filter = {
      _id: new Types.ObjectId(taskId),
      $or: [
        { checkoutAgentId: null },
        { checkoutAgentId: { $exists: false } },
        { checkoutAgentId: agentId },
      ],
      isDeleted: false,
    };
    const update = {
      $set: {
        checkedOutAt: new Date(),
        checkoutAgentId: agentId,
        checkoutRunId: runId,
        status: 'in_progress',
      },
    };

    const updated = await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(filter, update, { new: true });

    return updated as unknown as TaskDocument | null;
  }

  async release(taskId: string, agentId: string): Promise<TaskDocument> {
    const filter = {
      _id: new Types.ObjectId(taskId),
      checkoutAgentId: agentId,
      isDeleted: false,
    };
    const update = {
      $unset: {
        checkedOutAt: '',
        checkoutAgentId: '',
        checkoutRunId: '',
      },
    };

    const updated = await (
      this.model as never as import('mongoose').Model<Record<string, unknown>>
    ).findOneAndUpdate(filter, update, { new: true });

    if (!updated) {
      throw new NotFoundException('Task', taskId);
    }

    return updated as unknown as TaskDocument;
  }

  private validateStatusTransition(
    currentStatus: TaskStatus,
    newStatus: TaskStatus,
  ): void {
    if (currentStatus === newStatus) return;

    const allowed = STATUS_TRANSITIONS[currentStatus];
    if (!allowed?.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowed?.join(', ') ?? 'none'}`,
      );
    }
  }
}
