import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/enums';
import type {
  IListeningScope,
  IListeningTopicOutcome,
  ListeningOutcomeState,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

type OutcomeAnalyticsRecord = {
  createdAt: Date;
  date: Date;
  id: string;
};

type AttributedPostRecord = {
  brandId: string;
  createdAt: Date;
  externalId?: string | null;
  groupId?: string | null;
  id: string;
  listeningEvidenceIds: string[];
  listeningThemeId: string;
  listeningTopicId: string;
  organizationId: string;
  postAnalytics: OutcomeAnalyticsRecord[];
  publishedAt?: Date | null;
  publicationDate?: Date | null;
  scheduledDate?: Date | null;
  sourceActionId?: string | null;
  targetExecutionState: string;
  updatedAt: Date;
};

type ListeningAttributionDatabase = {
  listeningTheme: {
    findFirst: (
      args: Record<string, unknown>,
    ) => Promise<{ id: string } | null>;
  };
  post: {
    findMany: (
      args: Record<string, unknown>,
    ) => Promise<AttributedPostRecord[]>;
  };
};

@Injectable()
export class ListeningTopicAttributionService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): ListeningAttributionDatabase {
    return this.prisma as unknown as ListeningAttributionDatabase;
  }

  async listOutcomesScoped(
    topicId: string,
    themeId: string,
    context: IListeningScope,
  ): Promise<IListeningTopicOutcome[]> {
    const theme = await this.db.listeningTheme.findFirst({
      select: { id: true },
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: themeId,
        topicId,
      }),
    });
    if (!theme) {
      throw new NotFoundException({ message: 'Listening theme not found' });
    }

    const posts = await this.db.post.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        brandId: true,
        createdAt: true,
        externalId: true,
        groupId: true,
        id: true,
        listeningEvidenceIds: true,
        listeningThemeId: true,
        listeningTopicId: true,
        organizationId: true,
        postAnalytics: {
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          select: { createdAt: true, date: true, id: true },
          take: 1,
          where: {
            brandId: context.brandId,
            organizationId: context.organizationId,
          },
        },
        publicationDate: true,
        publishedAt: true,
        scheduledDate: true,
        sourceActionId: true,
        targetExecutionState: true,
        updatedAt: true,
      },
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        listeningThemeId: themeId,
        listeningTopicId: topicId,
      }),
    });

    return posts.map((post) => this.toOutcome(post));
  }

  private toOutcome(post: AttributedPostRecord): IListeningTopicOutcome {
    const latestAnalytics = post.postAnalytics[0];
    return {
      actionId: post.id,
      brandId: post.brandId,
      createdAt: post.createdAt.toISOString(),
      evidenceIds: [...post.listeningEvidenceIds],
      id: post.id,
      isDeleted: false,
      latestPostAnalyticsId: latestAnalytics?.id ?? null,
      measuredAt: latestAnalytics?.createdAt.toISOString() ?? null,
      organizationId: post.organizationId,
      publicationId: post.externalId ?? null,
      publishedAt:
        (post.publishedAt ?? post.publicationDate)?.toISOString() ?? null,
      releaseId: post.groupId ?? null,
      scheduledAt: post.scheduledDate?.toISOString() ?? null,
      sourcePostId: post.sourceActionId ?? null,
      state: resolveOutcomeState(post, latestAnalytics),
      themeId: post.listeningThemeId,
      topicId: post.listeningTopicId,
      updatedAt: post.updatedAt.toISOString(),
    };
  }
}

function resolveOutcomeState(
  post: AttributedPostRecord,
  latestAnalytics?: OutcomeAnalyticsRecord,
): ListeningOutcomeState {
  if (latestAnalytics) {
    return 'measured';
  }
  if (
    post.targetExecutionState === TargetExecutionState.PUBLISHED ||
    post.externalId
  ) {
    return 'published';
  }
  if (post.targetExecutionState === TargetExecutionState.SCHEDULED) {
    return 'scheduled';
  }
  return 'draft';
}
