import {
  type PublishPipelineApprovalRow,
  type PublishPipelineReviewedPostRow,
  summarizePublishPipeline,
  summarizeReviewQueue,
  toPublishPipelineItem,
  toReviewedPostItem,
} from '@api/endpoints/admin/publish-pipeline/publish-pipeline.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PersistedReviewDecision } from '@genfeedai/contracts';
import type { IPublishPipelineReport } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 3;
const ITEM_LIMIT = 100;
/** Per organization, so one busy organization cannot hide the others. */
const APPROVALS_PER_ORGANIZATION = 500;
const REVIEWED_POSTS_PER_ORGANIZATION = 500;

export interface PublishPipelineReportOptions {
  /** List posts reviewed with any decision, not only approved ones. */
  isAnyDecision?: boolean;
}

@Traced()
@Injectable()
export class PublishPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * What became of items approved for publishing in the window: the publish
   * approvals and the posts they approved, read through each organization so
   * every row stays scoped to the organization that owns it. The review queue
   * section covers posts approved there in the same window, including those
   * approved without a schedule date, which get no publish approval. With
   * `isAnyDecision` that section lists every post reviewed in the window, so a
   * rejected or never-approved item is visible too. Read-only.
   */
  async getReport(
    windowDays = DEFAULT_WINDOW_DAYS,
    now = new Date(),
    { isAnyDecision = false }: PublishPipelineReportOptions = {},
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
              select: {
                platform: true,
                scheduledDate: true,
                status: true,
                targetExecutionState: true,
              },
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

    const reviewedPosts = await this.getReviewedPosts(since, isAnyDecision);

    return {
      counts: summarizePublishPipeline(rows, now),
      generatedAt: now.toISOString(),
      itemLimit: ITEM_LIMIT,
      items: rows.slice(0, ITEM_LIMIT).map(toPublishPipelineItem),
      reviewQueue: {
        isAnyDecision,
        counts: summarizeReviewQueue(reviewedPosts, now),
        items: reviewedPosts.slice(0, ITEM_LIMIT).map(toReviewedPostItem),
      },
      since: since.toISOString(),
      windowDays,
    };
  }

  private async getReviewedPosts(
    since: Date,
    isAnyDecision: boolean,
  ): Promise<PublishPipelineReviewedPostRow[]> {
    const reviewedInWindow = {
      isDeleted: false,
      ...(isAnyDecision
        ? {}
        : { reviewDecision: PersistedReviewDecision.APPROVED }),
      reviewedAt: { gte: since },
    };
    const organizations = await this.prisma.organization.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        posts: {
          orderBy: { reviewedAt: 'desc' },
          select: {
            brandId: true,
            id: true,
            organizationId: true,
            platform: true,
            reviewDecision: true,
            reviewedAt: true,
            scheduledDate: true,
            status: true,
            targetExecutionState: true,
          },
          take: REVIEWED_POSTS_PER_ORGANIZATION,
          where: reviewedInWindow,
        },
      },
      where: { isDeleted: false, posts: { some: reviewedInWindow } },
    });

    const rows: PublishPipelineReviewedPostRow[] = [];
    for (const organization of organizations) {
      for (const post of organization.posts) {
        if (post.reviewedAt) {
          rows.push({ ...post, reviewedAt: post.reviewedAt });
        }
      }
    }
    return rows.sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime());
  }
}
