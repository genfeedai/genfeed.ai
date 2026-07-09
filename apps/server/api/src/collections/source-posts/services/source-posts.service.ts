import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { SourcePostDocument } from '@api/collections/source-posts/schemas/source-post.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { TwitterPipelineService } from '@api/services/twitter-pipeline/twitter-pipeline.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  PostStatus,
  SocialSourcePlatform,
  SourcePostActionType,
} from '@genfeedai/enums';
import type {
  SourcePostDraftActionInput,
  SourcePostMetrics,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type SourceRecord = {
  id: string;
  organizationId: string;
  brandId: string;
  userId: string;
  platform: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  followersCount?: number | null;
};

type SourcePostCreateInput = {
  organizationId: string;
  brandId: string;
  userId?: string | null;
  sourceId: string;
  platform: string;
  externalId: string;
  contentType: string;
  text?: string | null;
  authorId?: string | null;
  authorHandle?: string | null;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
  authorFollowersCount?: number | null;
  sourceUrl?: string | null;
  mediaUrls?: string[];
  thumbnailUrl?: string | null;
  metrics?: SourcePostMetrics;
  hashtags?: string[];
  publishedAt?: Date | null;
  raw?: Record<string, unknown>;
};

type PrismaDelegate<T> = {
  count: (args?: Record<string, unknown>) => Promise<number>;
  create: (args: Record<string, unknown>) => Promise<T>;
  findFirst: (args?: Record<string, unknown>) => Promise<T | null>;
  findMany: (args?: Record<string, unknown>) => Promise<T[]>;
  update: (args: Record<string, unknown>) => Promise<T>;
  upsert: (args: Record<string, unknown>) => Promise<T>;
};

type PrismaWithSourcePosts = Omit<
  PrismaService,
  'credential' | 'post' | 'sourcePost'
> & {
  credential: PrismaDelegate<{
    id: string;
    platform: string;
  }>;
  post: PrismaDelegate<{
    id: string;
    ingredients?: Array<{ id: string }>;
    label?: string | null;
    status?: string | null;
  }>;
  sourcePost: PrismaDelegate<SourcePostDocument>;
};

export interface SourcePostListResult {
  docs: SourcePostDocument[];
  total: number;
  limit: number;
  page: number;
  pages: number;
}

export interface WeeklySourceCorpusResult {
  corpus: string;
  posts: SourcePostDocument[];
  count: number;
}

@Injectable()
export class SourcePostsService {
  constructor(
    private readonly prisma: PrismaService,
    readonly _logger: LoggerService,
    private readonly credentialsService: CredentialsService,
    private readonly twitterPipelineService: TwitterPipelineService,
  ) {}

  private get db(): PrismaWithSourcePosts {
    return this.prisma as unknown as PrismaWithSourcePosts;
  }

  async listByBrand(
    context: { organizationId: string; brandId: string },
    query: {
      page?: number;
      limit?: number;
      platform?: string;
      search?: string;
      source?: string;
    } = {},
  ): Promise<SourcePostListResult> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const where = this.buildScopedWhere(context, query);
    const [docs, total] = await Promise.all([
      this.db.sourcePost.findMany({
        include: { source: true },
        orderBy: [{ publishedAt: 'desc' }, { collectedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.db.sourcePost.count({ where }),
    ]);

    return {
      docs,
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async findOneScoped(
    id: string,
    context: { organizationId: string; brandId: string },
  ): Promise<SourcePostDocument> {
    const post = await this.db.sourcePost.findFirst({
      include: { source: true },
      where: {
        brandId: context.brandId,
        id,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });

    if (!post) {
      throw new NotFoundException({ message: 'Source post not found' });
    }

    return post;
  }

  async upsertCollectedPosts(
    source: SourceRecord,
    posts: SourcePostCreateInput[],
  ): Promise<SourcePostDocument[]> {
    const collected: SourcePostDocument[] = [];

    for (const post of posts) {
      const saved = await this.db.sourcePost.upsert({
        create: {
          authorAvatarUrl: post.authorAvatarUrl ?? source.avatarUrl ?? null,
          authorDisplayName:
            post.authorDisplayName ?? source.displayName ?? null,
          authorFollowersCount:
            post.authorFollowersCount ?? source.followersCount ?? null,
          authorHandle: post.authorHandle ?? source.handle,
          authorId: post.authorId ?? null,
          brandId: source.brandId,
          contentType: post.contentType,
          externalId: post.externalId,
          hashtags: post.hashtags ?? [],
          mediaUrls: post.mediaUrls ?? [],
          metrics: post.metrics ?? {},
          organizationId: source.organizationId,
          platform: source.platform,
          publishedAt: post.publishedAt ?? null,
          raw: post.raw ?? {},
          sourceId: source.id,
          sourceUrl: post.sourceUrl ?? null,
          text: post.text ?? null,
          thumbnailUrl: post.thumbnailUrl ?? null,
          userId: post.userId ?? source.userId ?? null,
        },
        update: {
          authorAvatarUrl: post.authorAvatarUrl ?? source.avatarUrl ?? null,
          authorDisplayName:
            post.authorDisplayName ?? source.displayName ?? null,
          authorFollowersCount:
            post.authorFollowersCount ?? source.followersCount ?? null,
          authorHandle: post.authorHandle ?? source.handle,
          authorId: post.authorId ?? null,
          contentType: post.contentType,
          hashtags: post.hashtags ?? [],
          isDeleted: false,
          mediaUrls: post.mediaUrls ?? [],
          metrics: post.metrics ?? {},
          platform: source.platform,
          publishedAt: post.publishedAt ?? null,
          raw: post.raw ?? {},
          sourceUrl: post.sourceUrl ?? null,
          text: post.text ?? null,
          thumbnailUrl: post.thumbnailUrl ?? null,
          userId: post.userId ?? source.userId ?? null,
        },
        where: {
          sourceId_externalId: {
            externalId: post.externalId,
            sourceId: source.id,
          },
        },
      });
      collected.push(saved);
    }

    return collected;
  }

  async getWeeklyCorpus(
    organizationId: string,
    brandId: string,
    days = 7,
    limit = 50,
  ): Promise<WeeklySourceCorpusResult> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const posts = await this.db.sourcePost.findMany({
      include: { source: true },
      orderBy: [{ publishedAt: 'desc' }, { collectedAt: 'desc' }],
      take: Math.min(100, Math.max(1, limit)),
      where: {
        brandId,
        isDeleted: false,
        organizationId,
        OR: [
          { publishedAt: { gte: since } },
          { publishedAt: null, collectedAt: { gte: since } },
        ],
      },
    });

    const corpus = posts
      .map((post, index) => this.formatCorpusPost(post, index + 1))
      .join('\n\n');

    return {
      corpus:
        corpus ||
        `No followed source posts were collected for this brand in the last ${days} days.`,
      count: posts.length,
      posts,
    };
  }

  async createDraftFromPost(
    id: string,
    context: { organizationId: string; brandId: string; userId: string },
    input: SourcePostDraftActionInput = {},
  ) {
    const sourcePost = await this.findOneScoped(id, context);
    const platform = normalizeCredentialPlatform(sourcePost.platform);
    const credential = await this.credentialsService.findOne({
      brand: context.brandId,
      isConnected: true,
      isDeleted: false,
      organization: context.organizationId,
      platform,
    });

    if (!credential?.id) {
      throw new BadRequestException(
        `No connected ${sourcePost.platform} credential found for this brand`,
      );
    }

    const actionType = input.actionType ?? SourcePostActionType.DRAFT;
    const description = input.text?.trim() || buildDraftDescription(sourcePost);
    const post = await this.db.post.create({
      data: {
        brandId: context.brandId,
        category: 'TEXT',
        credentialId: credential.id,
        description,
        label: buildDraftLabel(actionType, sourcePost),
        organizationId: context.organizationId,
        platform,
        quoteTweetId:
          sourcePost.platform === SocialSourcePlatform.TWITTER &&
          actionType === SourcePostActionType.QUOTE
            ? sourcePost.externalId
            : null,
        source: 'source-post',
        sourceActionId: sourcePost.id,
        status: PostStatus.DRAFT,
        userId: context.userId,
      },
    });

    return { draftId: post.id, post };
  }

  async publishTwitterAction(
    id: string,
    context: { organizationId: string; brandId: string },
    input: { actionType: SourcePostActionType; text: string },
  ) {
    const sourcePost = await this.findOneScoped(id, {
      brandId: context.brandId,
      organizationId: context.organizationId,
    });

    if (sourcePost.platform !== SocialSourcePlatform.TWITTER) {
      throw new BadRequestException(
        'Replies and quote posts are only supported for X sources',
      );
    }

    if (
      input.actionType !== SourcePostActionType.REPLY &&
      input.actionType !== SourcePostActionType.QUOTE
    ) {
      throw new BadRequestException(
        'Only reply and quote actions can publish to X',
      );
    }

    return this.twitterPipelineService.publish(
      context.organizationId,
      context.brandId,
      {
        targetTweetId: sourcePost.externalId,
        text: input.text,
        type:
          input.actionType === SourcePostActionType.QUOTE ? 'quote' : 'reply',
      },
    );
  }

  async attachIngredientToPost(
    postId: string,
    ingredientId: string,
    context: { organizationId: string; brandId: string },
  ) {
    const post = await this.db.post.findFirst({
      include: { ingredients: { select: { id: true } } },
      where: {
        brandId: context.brandId,
        id: postId,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });

    if (!post) {
      throw new NotFoundException({
        message: 'Post draft not found for image attachment',
      });
    }

    const ingredientIds = new Set([
      ...(post.ingredients ?? []).map((ingredient) => ingredient.id),
      ingredientId,
    ]);
    const updated = await this.db.post.update({
      data: {
        category: 'IMAGE',
        ingredients: {
          set: Array.from(ingredientIds).map((id) => ({ id })),
        },
      },
      where: { id: postId },
    });

    return {
      ingredientId,
      post: updated,
      postId,
      status: 'attached',
    };
  }

  private buildScopedWhere(
    context: { organizationId: string; brandId: string },
    query: { platform?: string; search?: string; source?: string },
  ) {
    const where: Record<string, unknown> = {
      brandId: context.brandId,
      isDeleted: false,
      organizationId: context.organizationId,
    };

    if (query.platform) {
      where.platform = query.platform;
    }

    if (query.source) {
      where.sourceId = query.source;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { text: { contains: search, mode: 'insensitive' } },
        { authorHandle: { contains: search, mode: 'insensitive' } },
        { authorDisplayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private formatCorpusPost(post: SourcePostDocument, index: number): string {
    const metrics = post.metrics ?? {};
    const metricText = [
      typeof metrics.likes === 'number' ? `${metrics.likes} likes` : undefined,
      typeof metrics.comments === 'number'
        ? `${metrics.comments} comments`
        : undefined,
      typeof metrics.shares === 'number'
        ? `${metrics.shares} shares`
        : undefined,
      typeof metrics.views === 'number' ? `${metrics.views} views` : undefined,
    ]
      .filter(Boolean)
      .join(', ');

    return [
      `${index}. ${post.platform} @${post.authorHandle ?? 'unknown'}${
        post.publishedAt
          ? ` (${new Date(post.publishedAt).toISOString().slice(0, 10)})`
          : ''
      }`,
      post.text?.trim() || '(media-only post)',
      metricText ? `Metrics: ${metricText}` : undefined,
      post.sourceUrl ? `Source: ${post.sourceUrl}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n');
  }
}

function normalizeCredentialPlatform(platform: string): CredentialPlatform {
  switch (platform) {
    case SocialSourcePlatform.INSTAGRAM:
      return CredentialPlatform.INSTAGRAM;
    case SocialSourcePlatform.TIKTOK:
      return CredentialPlatform.TIKTOK;
    default:
      return CredentialPlatform.TWITTER;
  }
}

function buildDraftDescription(sourcePost: SourcePostDocument): string {
  const sourceText = sourcePost.text?.trim() || 'this source post';
  if (sourcePost.platform === SocialSourcePlatform.TWITTER) {
    return `Draft a brand-fit response inspired by: ${sourceText}`;
  }
  return `Draft a brand-fit remix inspired by: ${sourceText}`;
}

function buildDraftLabel(
  actionType: SourcePostDraftActionInput['actionType'],
  sourcePost: SourcePostDocument,
): string {
  const prefix =
    actionType === SourcePostActionType.REPLY
      ? 'Reply'
      : actionType === SourcePostActionType.QUOTE
        ? 'QRT'
        : 'Source draft';
  const handle = sourcePost.authorHandle
    ? `@${sourcePost.authorHandle}`
    : sourcePost.platform;
  return `${prefix}: ${handle}`.slice(0, 120);
}
