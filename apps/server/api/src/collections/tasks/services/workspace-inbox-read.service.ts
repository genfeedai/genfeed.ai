import type { WorkspaceInboxReadVersionDto } from '@api/collections/tasks/dto/workspace-inbox-read.dto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { IWorkspaceInboxReadState } from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class WorkspaceInboxReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    userId: string,
  ): Promise<IWorkspaceInboxReadState> {
    const reads = await this.prisma.workspaceInboxRead.findMany({
      where: scopedWhere(organizationId, {
        organizationId,
        userId,
        isDeleted: false,
        task: { organizationId, isDeleted: false },
      }),
      select: { taskId: true, seenUpdatedAt: true },
    });
    const tasks = await this.prisma.task.findMany({
      where: scopedWhere(organizationId, {
        organizationId,
        isDeleted: false,
        dismissedAt: null,
        reviewState: { not: 'dismissed' },
      }),
      select: { id: true, updatedAt: true },
    });
    const seenVersions = new Map(
      reads.map((read) => [read.taskId, read.seenUpdatedAt.getTime()]),
    );
    return {
      unreadCount: tasks.filter(
        (task) => task.updatedAt.getTime() > (seenVersions.get(task.id) ?? 0),
      ).length,
      id: organizationId,
      reads: reads.map((read) => ({
        taskId: read.taskId,
        seenUpdatedAt: read.seenUpdatedAt.toISOString(),
      })),
    };
  }

  async markAllRead(
    organizationId: string,
    userId: string,
  ): Promise<IWorkspaceInboxReadState> {
    const tasks = await this.prisma.task.findMany({
      where: scopedWhere(organizationId, {
        organizationId,
        isDeleted: false,
        dismissedAt: null,
        reviewState: { not: 'dismissed' },
      }),
      select: { id: true, updatedAt: true },
    });
    return this.markRead(
      organizationId,
      userId,
      tasks.map((task) => ({
        taskId: task.id,
        seenUpdatedAt: task.updatedAt.toISOString(),
      })),
    );
  }

  async markRead(
    organizationId: string,
    userId: string,
    reads: WorkspaceInboxReadVersionDto[],
  ): Promise<IWorkspaceInboxReadState> {
    const uniqueReads = new Map(reads.map((read) => [read.taskId, read]));
    const tasks = await this.prisma.task.findMany({
      where: scopedWhere(organizationId, {
        organizationId,
        isDeleted: false,
        id: { in: [...uniqueReads.keys()] },
      }),
      select: { id: true, updatedAt: true },
    });
    // Acknowledge the displayed version, never a newer unseen update. Validate
    // the entire batch before writing, including tenant ownership.
    if (
      tasks.length !== uniqueReads.size ||
      tasks.some((task) => {
        const version = new Date(uniqueReads.get(task.id)?.seenUpdatedAt ?? '');
        return !Number.isFinite(version.getTime()) || version > task.updatedAt;
      })
    )
      throw new BadRequestException('Invalid workspace inbox task version');

    await this.prisma.$transaction(async (transaction) => {
      for (const task of tasks) {
        const seenUpdatedAt = new Date(
          uniqueReads.get(task.id)?.seenUpdatedAt ?? '',
        );
        const where = { organizationId, userId, taskId: task.id };
        // Concurrent/older acknowledgements cannot overwrite a newer version.
        await transaction.workspaceInboxRead.createMany({
          data: [{ ...where, seenUpdatedAt }],
          skipDuplicates: true,
        });
        await transaction.workspaceInboxRead.updateMany({
          where: scopedWhere(organizationId, {
            ...where,
            isDeleted: false,
            seenUpdatedAt: { lt: seenUpdatedAt },
          }),
          data: { seenUpdatedAt },
        });
      }
    });
    return this.list(organizationId, userId);
  }
}
