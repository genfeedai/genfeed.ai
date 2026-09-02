import type { CollectListeningTopicDto } from '@api/collections/listening-topics/dto/collect-listening-topic.dto';
import type { ListeningTopicDocument } from '@api/collections/listening-topics/schemas/listening-topic.schema';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { SourceCollectorService } from '@api/services/source-collector/source-collector.service';
import type { CollectedSourcePost } from '@api/services/source-collector/source-collector.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createConcurrencyLimit } from '@api/shared/utils/create-concurrency-limit.util';
import { ListeningEvidenceType, SocialSourcePlatform } from '@genfeedai/enums';
import type {
  IListeningScope,
  ListeningTopicCollectionState,
} from '@genfeedai/interfaces';
import { LISTENING_CONTRACT_VERSION } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

const LISTENING_SOURCE_COLLECTION_CONCURRENCY = 3;
const finalTopicInclude = {
  sources: {
    orderBy: { createdAt: 'asc' as const },
    where: { isDeleted: false },
  },
} as const;

type CollectorSource = {
  avatarUrl?: string | null;
  brandId: string;
  credentialId?: string | null;
  displayName?: string | null;
  followersCount?: number | null;
  handle: string;
  id: string;
  organizationId: string;
  platform: string;
  userId: string;
};

type CollectorTopicSource = {
  collectionCursor?: string | null;
  id: string;
  platform: string;
  source: CollectorSource;
  sourceId: string;
  topicId: string;
};

type CollectorTopic = {
  brandId: string;
  excludedKeywords: string[];
  freshnessHours: number;
  id: string;
  keywords: string[];
  languages: string[];
  organizationId: string;
  sources: CollectorTopicSource[];
};

@Injectable()
export class ListeningTopicCollectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceCollector: SourceCollectorService,
    private readonly sourcePostsService: SourcePostsService,
  ) {}

  async collectScoped(
    topicId: string,
    dto: CollectListeningTopicDto,
    context: IListeningScope,
  ): Promise<ListeningTopicDocument> {
    const topic = (await this.prisma.listeningTopic.findFirst({
      include: {
        sources: {
          include: { source: true },
          orderBy: { createdAt: 'asc' },
          where: {
            brandId: context.brandId,
            isDeleted: false,
            organizationId: context.organizationId,
            source: {
              is: {
                brandId: context.brandId,
                isActive: true,
                isDeleted: false,
                organizationId: context.organizationId,
              },
            },
          },
        },
      },
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: topicId,
        isActive: true,
      }),
    })) as unknown as CollectorTopic | null;

    if (!topic) {
      throw new NotFoundException({ message: 'Listening topic not found' });
    }

    const limit = createConcurrencyLimit(
      LISTENING_SOURCE_COLLECTION_CONCURRENCY,
    );
    await Promise.all(
      topic.sources.map((topicSource) =>
        limit(() => this.collectSource(topic, topicSource, dto.limit ?? 25)),
      ),
    );

    const updated = await this.prisma.listeningTopic.findFirst({
      include: finalTopicInclude,
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: topicId,
        isActive: true,
      }),
    });
    if (!updated) {
      throw new NotFoundException({ message: 'Listening topic not found' });
    }

    return updated as unknown as ListeningTopicDocument;
  }

  private async collectSource(
    topic: CollectorTopic,
    topicSource: CollectorTopicSource,
    limit: number,
  ): Promise<void> {
    const collectedAt = new Date();
    try {
      const platform = toCollectorPlatform(topicSource.platform);
      const collected = await this.sourceCollector.collectTimeline(
        platform,
        topicSource.source.handle,
        {
          brandId: topic.brandId,
          credentialId: topicSource.source.credentialId ?? undefined,
          includeReplies: true,
          includeReposts: false,
          limit,
          organizationId: topic.organizationId,
          sinceId: topicSource.collectionCursor ?? undefined,
        },
      );
      const matchingPosts = collected.posts.filter((post) =>
        matchesTopic(post, topic),
      );

      if (!matchingPosts.length) {
        await this.commitEmptyState(topic, topicSource, collectedAt);
        return;
      }

      const { posts: sourcePosts, rejectedCount } =
        await this.sourcePostsService.upsertCollectedPosts(
          topicSource.source,
          matchingPosts.map((post) => normalizeSourcePost(topicSource, post)),
        );
      const rejectedPostMessage =
        rejectedCount > 0
          ? `Skipped ${rejectedCount} collected ${rejectedCount === 1 ? 'post' : 'posts'} without a stable external identifier`
          : null;

      if (sourcePosts.length === 0) {
        await this.commitEmptyState(
          topic,
          topicSource,
          collectedAt,
          rejectedPostMessage,
        );
        return;
      }

      await this.prisma.$transaction(async (transaction) => {
        for (const sourcePost of sourcePosts) {
          const post = matchingPosts.find(
            (candidate) =>
              typeof candidate.id === 'string' &&
              candidate.id.trim() === sourcePost.externalId,
          );
          if (!post) {
            throw new Error(
              `Source post persistence did not return ${sourcePost.externalId}`,
            );
          }
          const normalizedPost = { ...post, id: sourcePost.externalId };
          const evidence = buildEvidence(
            topic,
            topicSource,
            normalizedPost,
            sourcePost.id,
            collected.provider,
            collectedAt,
          );
          // tenant-scope-ignore: topicId is tenant-owned and globally unique; isDeleted is omitted so recollection reactivates matching tombstoned evidence
          await transaction.listeningEvidence.upsert({
            create: evidence,
            update: {
              authorExternalId: evidence.authorExternalId,
              authorHandle: evidence.authorHandle,
              collectedAt: evidence.collectedAt,
              contentExcerpt: evidence.contentExcerpt,
              contractVersion: evidence.contractVersion,
              eventType: evidence.eventType,
              freshnessExpiresAt: evidence.freshnessExpiresAt,
              isDeleted: false,
              metadata: evidence.metadata,
              metrics: evidence.metrics,
              occurredAt: evidence.occurredAt,
              sourcePostId: evidence.sourcePostId,
              sourceUrl: evidence.sourceUrl,
              topicSourceId: evidence.topicSourceId,
            },
            where: {
              topicId_platform_externalId: {
                externalId: normalizedPost.id,
                platform: topicSource.platform,
                topicId: topic.id,
              },
            },
          });
        }

        await transaction.listeningTopicSource.update({
          data: {
            collectionCursor: sourcePosts[0].externalId,
            collectionState: 'success',
            lastCollectedAt: collectedAt,
            lastCollectionError: rejectedPostMessage,
            rateLimitedAt: null,
          },
          where: scopedWhere(topic.organizationId, {
            brandId: topic.brandId,
            id: topicSource.id,
            topicId: topic.id,
          }),
        });
        await transaction.listeningTopic.update({
          data: { lastCollectedAt: collectedAt },
          where: scopedWhere(topic.organizationId, {
            brandId: topic.brandId,
            id: topic.id,
          }),
        });
      });
    } catch (error: unknown) {
      await this.recordFailure(topic, topicSource, error, collectedAt);
    }
  }

  private async commitEmptyState(
    topic: CollectorTopic,
    topicSource: CollectorTopicSource,
    collectedAt: Date,
    lastCollectionError: string | null = null,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.listeningTopicSource.update({
        data: {
          collectionState: 'empty',
          lastCollectedAt: collectedAt,
          lastCollectionError,
          rateLimitedAt: null,
        },
        where: scopedWhere(topic.organizationId, {
          brandId: topic.brandId,
          id: topicSource.id,
          topicId: topic.id,
        }),
      });
      await transaction.listeningTopic.update({
        data: { lastCollectedAt: collectedAt },
        where: scopedWhere(topic.organizationId, {
          brandId: topic.brandId,
          id: topic.id,
        }),
      });
    });
  }

  private async recordFailure(
    topic: CollectorTopic,
    topicSource: CollectorTopicSource,
    error: unknown,
    failedAt: Date,
  ): Promise<void> {
    const message = getErrorMessage(error);
    const collectionState: ListeningTopicCollectionState = isRateLimit(message)
      ? 'rate_limited'
      : 'failed';
    await this.prisma.listeningTopicSource.update({
      data: {
        collectionState,
        lastCollectionError: message,
        rateLimitedAt: collectionState === 'rate_limited' ? failedAt : null,
      },
      where: scopedWhere(topic.organizationId, {
        brandId: topic.brandId,
        id: topicSource.id,
        topicId: topic.id,
      }),
    });
  }
}

function matchesTopic(post: CollectedSourcePost, topic: CollectorTopic) {
  const text = post.text.trim().toLocaleLowerCase();
  const matchesKeyword = topic.keywords.some((keyword) =>
    text.includes(keyword.toLocaleLowerCase()),
  );
  if (!matchesKeyword) {
    return false;
  }
  if (
    topic.excludedKeywords.some((keyword) =>
      text.includes(keyword.toLocaleLowerCase()),
    )
  ) {
    return false;
  }

  return matchesLanguage(post, topic.languages);
}

function matchesLanguage(
  post: CollectedSourcePost,
  configuredLanguages: string[],
): boolean {
  if (!configuredLanguages.length) {
    return true;
  }

  const candidate = getPostLanguage(post);
  if (!candidate) {
    return false;
  }

  return configuredLanguages.some((configured) => {
    const language = configured.toLocaleLowerCase();
    return (
      candidate === language ||
      candidate.startsWith(`${language}-`) ||
      language.startsWith(`${candidate}-`)
    );
  });
}

function getPostLanguage(post: CollectedSourcePost): string | null {
  const candidate = post as CollectedSourcePost & {
    lang?: unknown;
    language?: unknown;
  };
  const language =
    typeof candidate.language === 'string'
      ? candidate.language
      : typeof candidate.lang === 'string'
        ? candidate.lang
        : null;
  return language?.trim().toLocaleLowerCase() || null;
}

function normalizeSourcePost(
  topicSource: CollectorTopicSource,
  post: CollectedSourcePost,
) {
  return {
    authorAvatarUrl: post.authorAvatarUrl ?? null,
    authorDisplayName: post.authorDisplayName ?? null,
    authorFollowersCount: post.authorFollowersCount ?? null,
    authorHandle: post.authorUsername,
    authorId: post.authorId,
    brandId: topicSource.source.brandId,
    contentType: post.contentType ?? 'post',
    externalId: post.id,
    hashtags: post.hashtags ?? [],
    mediaUrls: post.mediaUrls ?? [],
    metrics: sanitizeMetrics(post.metrics),
    organizationId: topicSource.source.organizationId,
    platform: topicSource.platform,
    publishedAt: post.createdAt ?? null,
    raw: post as unknown as Record<string, unknown>,
    sourceId: topicSource.sourceId,
    sourceUrl: post.contentUrl ?? null,
    text: post.text,
    thumbnailUrl: post.thumbnailUrl ?? null,
    userId: topicSource.source.userId,
  };
}

function buildEvidence(
  topic: CollectorTopic,
  topicSource: CollectorTopicSource,
  post: CollectedSourcePost,
  sourcePostId: string,
  provider: string,
  collectedAt: Date,
) {
  const occurredAt = post.createdAt ?? collectedAt;
  return {
    authorExternalId: post.authorId ?? null,
    authorHandle: post.authorUsername ?? null,
    brandId: topic.brandId,
    collectedAt,
    contentExcerpt: post.text.trim().slice(0, 1000) || null,
    contractVersion: LISTENING_CONTRACT_VERSION,
    eventType: post.inReplyToId
      ? ListeningEvidenceType.REPLY
      : ListeningEvidenceType.POST,
    externalId: post.id,
    freshnessExpiresAt: new Date(
      occurredAt.getTime() + topic.freshnessHours * 60 * 60 * 1000,
    ),
    isDeleted: false,
    metadata: {
      collectorProvider: provider,
      rawEvidenceReference: { sourcePostId },
    },
    metrics: sanitizeMetrics(post.metrics),
    occurredAt,
    organizationId: topic.organizationId,
    platform: topicSource.platform,
    sourcePostId,
    sourceUrl: post.contentUrl ?? null,
    topicId: topic.id,
    topicSourceId: topicSource.id,
  };
}

function sanitizeMetrics(
  metrics: CollectedSourcePost['metrics'],
): Record<string, number> {
  if (!metrics) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(metrics).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

function toCollectorPlatform(platform: string): SocialSourcePlatform {
  if (
    Object.values(SocialSourcePlatform).includes(
      platform as SocialSourcePlatform,
    )
  ) {
    return platform as SocialSourcePlatform;
  }
  throw new Error(`No source collectors registered for ${platform}`);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return 'Listening source collection failed';
}

function isRateLimit(message: string): boolean {
  return /\b429\b|quota|rate[\s_-]*limit|too many requests/i.test(message);
}
