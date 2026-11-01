import {
  type PublishPipelineApprovalRow,
  summarizePublishPipeline,
  toPublishPipelineItem,
} from '@api/endpoints/admin/publish-pipeline/publish-pipeline.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IPublishPipelineReport } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 3;
const ITEM_LIMIT = 100;
/** Per organization, so one busy organization cannot hide the others. */
const APPROVALS_PER_ORGANIZATION = 500;

@Injectable()
export class PublishPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * What became of items approved for publishing in the window: the publish
   * approvals and the posts they approved, read through each organization so
   * every row stays scoped to the organization that owns it. Read-only.
   */
  async getReport(
    windowDays = DEFAULT_WINDOW_DAYS,
    now = new Date(),
  ): Promise<IPublishPipelineReport> {
    const since = new Date(now.getTime() - windowDays * DAY_MS);
    const organizations = await this.prisma.organization.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        publishApprovals: {
          orderBy: { createdAt: 'desc' },
          select: {
            brandId: true,
            createdAt: true,
            executedAt: true,
            id: true,
            invalidatedAt: true,
            lastError: true,
            organizationId: true,
            post: {
              select: { platform: true, scheduledDate: true, status: true },
            },
            postId: true,
            status: true,
          },
          take: APPROVALS_PER_ORGANIZATION,
          where: { createdAt: { gte: since } },
        },
      },
      where: {
        isDeleted: false,
        publishApprovals: { some: { createdAt: { gte: since } } },
      },
    });

    const rows: PublishPipelineApprovalRow[] = organizations
      .flatMap((organization) => organization.publishApprovals)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      counts: summarizePublishPipeline(rows, now),
      generatedAt: now.toISOString(),
      itemLimit: ITEM_LIMIT,
      items: rows.slice(0, ITEM_LIMIT).map(toPublishPipelineItem),
      since: since.toISOString(),
      windowDays,
    };
  }
}
