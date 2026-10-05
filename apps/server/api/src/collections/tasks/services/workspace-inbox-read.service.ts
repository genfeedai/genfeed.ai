import type { WorkspaceInboxReadVersionDto } from '@api/collections/tasks/dto/workspace-inbox-read.dto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { IWorkspaceInboxReadState } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
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
        userId,
        task: {
          organizationId,
          isDeleted: false,
          dismissedAt: null,
          reviewState: { not: 'dismissed' },
        },
      }),
      select: { taskId: true, seenUpdatedAt: true },
    });
    const [count] = await this.prisma.$queryRaw<
      { unreadCount: number }[]
    >(Prisma.sql`
      SELECT COUNT(*)::int AS "unreadCount"
      FROM tasks t
      LEFT JOIN workspace_inbox_reads r
        ON r."taskId" = t.id AND r."organizationId" = ${organizationId}
        AND r."userId" = ${userId} AND r."isDeleted" = false
      WHERE t."organizationId" = ${organizationId} AND t."isDeleted" = false
        AND t."dismissedAt" IS NULL AND t."reviewState" <> 'dismissed'
        AND (r."seenUpdatedAt" IS NULL OR r."seenUpdatedAt" < t."updatedAt")
    `);
    return {
      id: organizationId,
      unreadCount: count?.unreadCount ?? 0,
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
    return this.saveVersions(
      organizationId,
      userId,
      Prisma.sql`
      SELECT id AS "taskId", "updatedAt" AS "seenUpdatedAt" FROM tasks
      WHERE "organizationId" = ${organizationId} AND "isDeleted" = false
        AND "dismissedAt" IS NULL AND "reviewState" <> 'dismissed'
    `,
    );
  }

  async markRead(
    organizationId: string,
    userId: string,
    reads: WorkspaceInboxReadVersionDto[],
  ): Promise<IWorkspaceInboxReadState> {
    const uniqueReads = new Map(reads.map((read) => [read.taskId, read]));
    if (uniqueReads.size === 0) return this.list(organizationId, userId);
    const tasks = await this.prisma.task.findMany({
      where: scopedWhere(organizationId, {
        id: { in: [...uniqueReads.keys()] },
      }),
      select: { id: true, updatedAt: true },
    });
    // Reject forged task ids or future versions before any write. A version
    // acknowledged after a newer update leaves that newer update unread.
    if (
      tasks.length !== uniqueReads.size ||
      tasks.some((task) => {
        const version = new Date(uniqueReads.get(task.id)?.seenUpdatedAt ?? '');
        return !Number.isFinite(version.getTime()) || version > task.updatedAt;
      })
    )
      throw new BadRequestException('Invalid workspace inbox task version');

    const versions = [...uniqueReads.values()].map(
      (read) =>
        Prisma.sql`(${read.taskId}::text, ${new Date(read.seenUpdatedAt)}::timestamp)`,
    );
    return this.saveVersions(
      organizationId,
      userId,
      Prisma.sql`
      SELECT * FROM (VALUES ${Prisma.join(versions)}) AS versions("taskId", "seenUpdatedAt")
    `,
    );
  }

  private async saveVersions(
    organizationId: string,
    userId: string,
    versions: Prisma.Sql,
  ): Promise<IWorkspaceInboxReadState> {
    // One atomic, set-based write for any queue size. The live-task join also
    // ignores tasks deleted after validation without marking other tenants.
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO workspace_inbox_reads (id, "organizationId", "userId", "taskId", "seenUpdatedAt", "updatedAt")
      SELECT gen_random_uuid()::text, ${organizationId}, ${userId}, v."taskId", v."seenUpdatedAt", NOW()
      FROM (${versions}) v
      JOIN tasks t ON t.id = v."taskId" AND t."organizationId" = ${organizationId}
      WHERE t."isDeleted" = false AND v."seenUpdatedAt" <= t."updatedAt"
      ON CONFLICT ("organizationId", "userId", "taskId") DO UPDATE SET
        "seenUpdatedAt" = GREATEST(workspace_inbox_reads."seenUpdatedAt", EXCLUDED."seenUpdatedAt"),
        "isDeleted" = false, "updatedAt" = NOW()
    `);
    return this.list(organizationId, userId);
  }
}
