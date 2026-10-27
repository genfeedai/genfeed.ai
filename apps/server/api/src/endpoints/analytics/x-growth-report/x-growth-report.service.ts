import { PostsService } from '@api/collections/posts/services/posts.service';
import type { XPostFacts } from '@api/endpoints/analytics/x-growth-report/x-growth-report.types';
import {
  buildXGrowthReport,
  X_GROWTH_MAX_PERIOD_DAYS,
} from '@api/endpoints/analytics/x-growth-report/x-growth-report.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { toPrismaCredentialPlatform } from '@genfeedai/contracts';
import type {
  IXGrowthPeriod,
  IXGrowthReport,
} from '@genfeedai/contracts/interfaces';
import type {
  PublicationInsight,
  PublicationInsightsScope,
} from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import { PrismaService } from '@libs/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const PUBLICATION_PAGE_SIZE = 100;
const MAX_PUBLICATION_PAGES = 2;

interface XGrowthReportRequest {
  credentialId: string;
  period: IXGrowthPeriod;
}

/**
 * What an X account published in a period, how each publication is doing, and
 * how the account's followers moved, for one authorized account of one brand.
 * It reads what is already stored (publication insights, account snapshots),
 * calls no X API and spends no credits. Nothing it returns ties a follower to
 * a post or a reply.
 */
@Injectable()
export class XGrowthReportService {
  constructor(
    private readonly postsService: PostsService,
    private readonly prisma: PrismaService,
  ) {}

  async build(
    scope: PublicationInsightsScope,
    request: XGrowthReportRequest,
    now: Date = new Date(),
  ): Promise<IXGrowthReport> {
    const period = this.validatePeriod(request.period, now);
    const credential = await this.prisma.credential.findFirst({
      select: { externalHandle: true, id: true, username: true },
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        id: request.credentialId,
        isDeleted: false,
        platform: toPrismaCredentialPlatform('twitter'),
      }),
    });
    if (!credential) {
      throw new NotFoundException('Credential', request.credentialId);
    }

    const publications: PublicationInsight[] = [];
    let isTruncated = false;
    for (let page = 1; page <= MAX_PUBLICATION_PAGES; page += 1) {
      const result = await this.postsService.getPublicationInsights(
        {
          brandId: scope.brandId,
          credentialId: [credential.id],
          limit: PUBLICATION_PAGE_SIZE,
          page,
          platform: 'twitter',
          publishedFrom: period.from,
          publishedTo: period.to,
        },
        scope,
      );
      publications.push(...result.docs);
      if (!result.hasNextPage) {
        break;
      }
      isTruncated = page === MAX_PUBLICATION_PAGES;
    }

    const postFacts = await this.loadPostFacts(
      scope,
      publications.map((publication) => publication.id),
    );
    const snapshots = await this.prisma.accountAnalyticsSnapshot.findMany({
      orderBy: { date: 'asc' },
      select: { date: true, followers: true, metricAvailability: true },
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        credentialId: credential.id,
        date: { gte: new Date(period.from), lte: new Date(period.to) },
      }),
    });

    return buildXGrowthReport({
      isTruncated,
      now,
      period,
      postFacts,
      publications,
      scope: {
        brandId: scope.brandId,
        credentialId: credential.id,
        handle: credential.externalHandle ?? credential.username ?? null,
        organizationId: scope.organizationId,
      },
      snapshots,
    });
  }

  /** What each post records about quoting and about who approved it. */
  private async loadPostFacts(
    scope: PublicationInsightsScope,
    postIds: string[],
  ): Promise<Map<string, XPostFacts>> {
    if (postIds.length === 0) {
      return new Map();
    }
    const posts = await this.prisma.post.findMany({
      select: {
        id: true,
        publishApproval: { select: { executedAt: true, status: true } },
        quoteTweetId: true,
        reviewDecision: true,
        reviewedAt: true,
      },
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        id: { in: postIds },
      }),
    });
    return new Map(
      posts.map((post) => {
        const hasApproval = Boolean(
          post.reviewDecision || post.reviewedAt || post.publishApproval,
        );
        return [
          post.id,
          {
            approval: hasApproval
              ? {
                  decision: post.reviewDecision ?? null,
                  publishApprovalExecutedAt:
                    post.publishApproval?.executedAt?.toISOString() ?? null,
                  publishApprovalStatus: post.publishApproval?.status ?? null,
                  reviewedAt: post.reviewedAt?.toISOString() ?? null,
                }
              : null,
            isQuote: Boolean(post.quoteTweetId),
          },
        ];
      }),
    );
  }

  private validatePeriod(period: IXGrowthPeriod, now: Date): IXGrowthPeriod {
    const from = new Date(period.from);
    const to = new Date(period.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('The report period is not a valid range.');
    }
    if (from.getTime() >= to.getTime() || from.getTime() > now.getTime()) {
      throw new BadRequestException(
        'The report period must start before it ends, and not in the future.',
      );
    }
    if (
      (to.getTime() - from.getTime()) / 86_400_000 >
      X_GROWTH_MAX_PERIOD_DAYS
    ) {
      throw new BadRequestException(
        `A report covers at most ${X_GROWTH_MAX_PERIOD_DAYS} days.`,
      );
    }
    return { from: from.toISOString(), to: to.toISOString() };
  }
}
