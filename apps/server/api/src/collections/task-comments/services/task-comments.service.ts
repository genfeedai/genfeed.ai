import { CreateTaskCommentDto } from '@api/collections/task-comments/dto/create-task-comment.dto';
import { UpdateTaskCommentDto } from '@api/collections/task-comments/dto/update-task-comment.dto';
import type { TaskCommentDocument } from '@api/collections/task-comments/schemas/task-comment.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TaskCommentsService extends BaseService<
  TaskCommentDocument,
  CreateTaskCommentDto,
  UpdateTaskCommentDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'taskComment', logger);
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
    taskId: string,
    organizationId: string,
  ): Promise<TaskCommentDocument[]> {
    const results = await this.prisma.taskComment.findMany({
      orderBy: { createdAt: 'asc' },
      where: {
        isDeleted: false,
        organizationId,
        taskId,
      },
    });
    return results as unknown as TaskCommentDocument[];
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateTaskCommentDto> | Record<string, unknown>,
  ): Promise<TaskCommentDocument> {
    return super.patch(String(id), updateDto);
  }
}
