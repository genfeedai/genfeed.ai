import type { CreateTaskCommentDto } from '@api/collections/task-comments/dto/create-task-comment.dto';
import type { UpdateTaskCommentDto } from '@api/collections/task-comments/dto/update-task-comment.dto';
import {
  TaskComment,
  type TaskCommentDocument,
} from '@api/collections/task-comments/schemas/task-comment.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class TaskCommentsService extends BaseService<
  TaskCommentDocument,
  CreateTaskCommentDto,
  UpdateTaskCommentDto
> {
  constructor(
    @InjectModel(TaskComment.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<TaskCommentDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  override async create(
    createDto: CreateTaskCommentDto,
  ): Promise<TaskCommentDocument> {
    return super.create(createDto);
  }

  /**
   * Find all comments for a given task within an organization.
   * Returns comments sorted by createdAt ascending (oldest first).
   */
  async findByTask(
    taskId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
  ): Promise<TaskCommentDocument[]> {
    return this.model
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        task: new Types.ObjectId(taskId),
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  override async patch(
    id: string | Types.ObjectId,
    updateDto: Partial<UpdateTaskCommentDto> | Record<string, unknown>,
  ): Promise<TaskCommentDocument> {
    return super.patch(String(id), updateDto);
  }
}
