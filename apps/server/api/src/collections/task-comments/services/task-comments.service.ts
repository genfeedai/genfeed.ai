import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import type { MentionedMember } from '@api/collections/mentions/interfaces/mention.interface';
import { TeammateMentionsService } from '@api/collections/mentions/services/teammate-mentions.service';
import { CreateTaskCommentDto } from '@api/collections/task-comments/dto/create-task-comment.dto';
import { UpdateTaskCommentDto } from '@api/collections/task-comments/dto/update-task-comment.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
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
    private readonly mentions: TeammateMentionsService,
  ) {
    super(prisma, 'taskComment', logger);
  }

  /**
   * Adds a comment to a task of the actor's organization. Every mention is
   * checked first (an active member who reaches the task's brand), so a refused
   * mention saves nothing; each mentioned teammate is announced once saved.
   */
  async createForTask(
    actor: BrandAccessActor,
    taskId: string,
    input: CreateTaskCommentDto,
  ): Promise<TaskComment & { mentions: MentionedMember[] }> {
    const task = await this.prisma.task.findFirst({
      select: { brandId: true, id: true, identifier: true, title: true },
      where: scopedWhere(actor.organizationId, { id: taskId }),
    });
    if (!task) {
      throw new NotFoundException('Task', taskId);
    }

    const mentionedUserIds = this.mentions.normalize(input.mentionedUserIds);
    await this.mentions.assertMentionable(
      actor.organizationId,
      task.brandId,
      mentionedUserIds,
    );

    const comment = await this.create({
      authorUserId: actor.userId,
      body: input.body,
      mentionedUserIds,
      organizationId: actor.organizationId,
      taskId: task.id,
    } as CreateTaskCommentDto & {
      authorUserId: string;
      organizationId: string;
      taskId: string;
    });

    this.mentions.announce(
      {
        actorUserId: actor.userId,
        brandId: task.brandId,
        label: task.title ?? task.identifier ?? 'a task',
        organizationId: actor.organizationId,
        source: { id: comment.id, type: 'task_comment' },
        taskId: task.id,
      },
      mentionedUserIds,
    );

    const [withMentions] = await this.mentions.attachMentions(
      actor.organizationId,
      [comment],
    );
    return withMentions;
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

  /** The task's comments, each with the names of the teammates it mentions. */
  async findByTaskWithMentions(
    taskId: string,
    organizationId: string,
  ): Promise<Array<TaskComment & { mentions: MentionedMember[] }>> {
    return this.mentions.attachMentions(
      organizationId,
      await this.findByTask(taskId, organizationId),
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateTaskCommentDto> | Record<string, unknown>,
  ): Promise<TaskComment> {
    return super.patch(String(id), updateDto);
  }
}
