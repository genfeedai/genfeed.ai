import { CreateTaskCommentDto } from '@api/collections/task-comments/dto/create-task-comment.dto';
import { UpdateTaskCommentDto } from '@api/collections/task-comments/dto/update-task-comment.dto';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { TaskComment } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

@Traced()
@Injectable()
export class TaskCommentsService extends BaseService<
  TaskComment,
  CreateTaskCommentDto,
  UpdateTaskCommentDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'taskComment', logger);
  }

  override async create(createDto: CreateTaskCommentDto): Promise<TaskComment> {
    return super.create(createDto);
  }

  /**
   * Find all comments for a given task within an organization.
   * Returns comments sorted by createdAt ascending (oldest first).
   */
  async findByTask(
    taskId: string,
    organizationId: string,
  ): Promise<TaskComment[]> {
    const results = await this.prisma.taskComment.findMany({
      orderBy: { createdAt: 'asc' },
      where: scopedWhere(organizationId, { taskId }),
    });
    return results as unknown as TaskComment[];
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateTaskCommentDto> | Record<string, unknown>,
  ): Promise<TaskComment> {
    return super.patch(String(id), updateDto);
  }
}
