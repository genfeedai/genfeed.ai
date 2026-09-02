import { createHash } from 'node:crypto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { SourcePostDocument } from '@api/collections/source-posts/schemas/source-post.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  PostVisibility,
  SocialSourcePlatform,
  SourcePostActionType,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ListeningPostAttributionInput,
  SourcePostDraftActionInput,
  SourcePostDraftActionResult,
  SourcePostMetrics,
} from '@genfeedai/contracts/interfaces';
import { MAX_LISTENING_ATTRIBUTION_EVIDENCE_IDS } from '@genfeedai/contracts/interfaces';
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

type CollectedPostData = {
  authorAvatarUrl: string | null;
  authorDisplayName: string | null;
  authorFollowersCount: number | null;
  authorHandle: string;
  authorId: string | null;
  contentType: string;
  hashtags: string[];
  mediaUrls: string[];
  metrics: SourcePostMetrics;
  platform: string;
  publishedAt: Date | null;
  raw: Record<string, unknown>;
  sourceUrl: string | null;
  text: string | null;
  thumbnailUrl: string | null;
  userId: string | null;
};

type PrismaDelegate<T> = {
  count: (args?: Record<string, unknown>) => Promise<number>;
  create: (args: Record<string, unknown>) => Promise<T>;
  findFirst: (args?: Record<string, unknown>) => Promise<T | null>;
  findMany: (args?: Record<string, unknown>) => Promise<T[]>;
  update: (args: Record<string, unknown>) => Promise<T>;
  upsert: (args: Record<string, unknown>) => Promise<T>;
};

type ListeningThemeAttributionRecord = {
  evidence: Array<{
    evidence: { id: string; sourcePostId?: string | null };
  }>;
  id: string;
};

type PrismaWithSourcePosts = Omit<
  PrismaService,
  'credential' | 'ingredient' | 'listeningTheme' | 'post' | 'sourcePost'
> & {
  credential: PrismaDelegate<{
    id: string;
    platform: string;
  }>;
  ingredient: PrismaDelegate<{
    id: string;
  }>;
  post: PrismaDelegate<{
    id: string;
    ingredients?: Array<{ id: string }>;
    label?: string | null;
    status?: string | null;
  }>;
  listeningTheme: PrismaDelegate<ListeningThemeAttributionRecord>;
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

export interface SourcePostUpsertResult {
  posts: SourcePostDocument[];
  rejectedCount: number;
}

@Injectable()
export class SourcePostsService {
  constructor(
    private readonly prisma: PrismaService,
    readonly _logger: LoggerService,
    private readonly credentialsService: CredentialsService,
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
      sourceId?: string;
    } = {},
  ): Promise<SourcePostListResult> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const where = this.buildScopedWhere(context, query);
    const [docs, total] = await Promise.all([
      this.db.sourcePost.findMany({
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

  async findByExternalIdScoped(
    context: { organizationId: string; brandId: string },
    platform: string,
    externalId: string,
  ): Promise<SourcePostDocument | null> {
    return this.db.sourcePost.findFirst({
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        externalId,
        platform,
      }),
    });
  }

  async findOneScoped(
    id: string,
    context: { organizationId: string; brandId: string },
  ): Promise<SourcePostDocument> {
    const post = await this.db.sourcePost.findFirst({
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id,
      }),
    });

    if (!post) {
      throw new NotFoundException({ message: 'Source post not found' });
    }

    return post;
  }

  async upsertCollectedPosts(
    source: SourceRecord,
    posts: SourcePostCreateInput[],
  ): Promise<SourcePostUpsertResult> {
    const collected: SourcePostDocument[] = [];
    let rejectedCount = 0;

    for (const post of posts) {
      const externalId =
        typeof post.externalId === 'string' ? post.externalId.trim() : '';
      if (!externalId) {
        rejectedCount++;
        continue;
      }

      const postData = this.buildCollectedPostData(post, source);
      // tenant-scope-ignore: sourceId is tenant-owned and globally unique; isDeleted is omitted so recollection reactivates a matching tombstoned post.
      const saved = await this.db.sourcePost.upsert({
        create: {
          ...postData,
          brandId: source.brandId,
          externalId,
          organizationId: source.organizationId,
          sourceId: source.id,
        },
        update: {
          ...postData,
          isDeleted: false,
        },
        where: {
          sourceId_externalId: {
            externalId,
            sourceId: source.id,
          },
        },
      });
      collected.push(saved);
    }

    if (rejectedCount > 0) {
      this._logger.warn(
        'Rejected collected posts without stable external identifiers',
        { rejectedCount, sourceId: source.id },
      );
    }

    return { posts: collected, rejectedCount };
  }

  private buildCollectedPostData(
    post: SourcePostCreateInput,
    source: SourceRecord,
  ): CollectedPostData {
    return {
      authorAvatarUrl: post.authorAvatarUrl ?? source.avatarUrl ?? null,
      authorDisplayName: post.authorDisplayName ?? source.displayName ?? null,
      authorFollowersCount:
        post.authorFollowersCount ?? source.followersCount ?? null,
      authorHandle: post.authorHandle ?? source.handle,
      authorId: post.authorId ?? null,
      contentType: post.contentType,
      hashtags: post.hashtags ?? [],
      mediaUrls: post.mediaUrls ?? [],
      metrics: post.metrics ?? {},
      platform: source.platform,
      publishedAt: post.publishedAt ?? null,
      raw: post.raw ?? {},
      sourceUrl: post.sourceUrl ?? null,
      text: post.text ?? null,
      thumbnailUrl: post.thumbnailUrl ?? null,
      userId: post.userId ?? source.userId ?? null,
    };
  }

  async getWeeklyCorpus(
    organizationId: string,
    brandId: string,
    days = 7,
    limit = 50,
  ): Promise<WeeklySourceCorpusResult> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const posts = await this.db.sourcePost.findMany({
      orderBy: [{ publishedAt: 'desc' }, { collectedAt: 'desc' }],
      take: Math.min(100, Math.max(1, limit)),
      where: scopedWhere(organizationId, {
        brandId,
        OR: [
          { publishedAt: { gte: since } },
          { publishedAt: null, collectedAt: { gte: since } },
        ],
      }),
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
  ): Promise<SourcePostDraftActionResult> {
    const sourcePost = await this.findOneScoped(id, context);
    const attribution = await this.resolveListeningAttribution(
      sourcePost.id,
      input,
      context,
    );
    const platform = normalizeCredentialPlatform(sourcePost.platform);
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId: context.brandId,
      credentialId: input.credentialId,
      organizationId: context.organizationId,
      platform,
    });

    if (!credential?.id) {
      throw new BadRequestException(
        `No connected ${sourcePost.platform} credential found for this brand`,
      );
    }

    const actionType = input.actionType ?? SourcePostActionType.DRAFT;
    const description = input.text?.trim() || buildDraftDescription(sourcePost);
    const targetIdempotencyKey = attribution
      ? buildAttributionIdempotencyKey(sourcePost.id, actionType, attribution)
      : null;
    const data = {
      brandId: context.brandId,
      category: 'TEXT',
      credentialId: credential.id,
      description,
      label: buildDraftLabel(actionType, sourcePost),
      ...(attribution && {
        listeningEvidenceIds: attribution.listeningEvidenceIds,
        listeningThemeId: attribution.listeningThemeId,
        listeningTopicId: attribution.listeningTopicId,
        targetIdempotencyKey,
      }),
      organizationId: context.organizationId,
      platform,
      quoteTweetId:
        sourcePost.platform === SocialSourcePlatform.TWITTER &&
        actionType === SourcePostActionType.QUOTE
          ? sourcePost.externalId
          : null,
      source: 'source-post',
      sourceActionId: sourcePost.id,
      targetExecutionState: TargetExecutionState.DRAFT,
      userId: context.userId,
      visibility: PostVisibility.PUBLIC,
    };
    if (attribution) {
      // tenant-scope-ignore: organizationId is pinned by the compound idempotency key; isDeleted is omitted so the draft can reactivate a tombstone
      const post = await this.db.post.upsert({
        create: data,
        update: { isDeleted: false },
        where: {
          organizationId_targetIdempotencyKey: {
            organizationId: context.organizationId,
            targetIdempotencyKey,
          },
        },
      });
      return { draftId: post.id, post };
    }

    const post = await this.db.post.create({ data });
    return { draftId: post.id, post };
  }

  private async resolveListeningAttribution(
    sourcePostId: string,
    input: SourcePostDraftActionInput,
    context: { organizationId: string; brandId: string },
  ): Promise<ListeningPostAttributionInput | null> {
    const hasAttribution = Boolean(
      input.listeningTopicId ||
        input.listeningThemeId ||
        input.listeningEvidenceIds,
    );
    if (!hasAttribution) {
      return null;
    }

    const listeningTopicId = input.listeningTopicId?.trim();
    const listeningThemeId = input.listeningThemeId?.trim();
    const listeningEvidenceIds = [
      ...new Set(
        (input.listeningEvidenceIds ?? [])
          .map((evidenceId) => evidenceId.trim())
          .filter(Boolean),
      ),
    ].sort();
    if (
      !listeningTopicId ||
      !listeningThemeId ||
      listeningEvidenceIds.length === 0 ||
      listeningEvidenceIds.length > MAX_LISTENING_ATTRIBUTION_EVIDENCE_IDS
    ) {
      throw new BadRequestException(
        'Listening attribution requires a topic, theme, and bounded evidence set',
      );
    }

    const theme = await this.db.listeningTheme.findFirst({
      include: {
        evidence: {
          include: {
            evidence: { select: { id: true, sourcePostId: true } },
          },
          where: {
            evidence: {
              brandId: context.brandId,
              id: { in: listeningEvidenceIds },
              isDeleted: false,
              organizationId: context.organizationId,
              topicId: listeningTopicId,
            },
          },
        },
      },
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: listeningThemeId,
        topic: {
          is: {
            brandId: context.brandId,
            isDeleted: false,
            organizationId: context.organizationId,
          },
        },
        topicId: listeningTopicId,
      }),
    });
    const representedEvidenceIds = new Set(
      theme?.evidence.map(({ evidence }) => evidence.id) ?? [],
    );
    const representsSourcePost = theme?.evidence.some(
      ({ evidence }) => evidence.sourcePostId === sourcePostId,
    );
    if (
      !theme ||
      representedEvidenceIds.size !== listeningEvidenceIds.length ||
      listeningEvidenceIds.some(
        (evidenceId) => !representedEvidenceIds.has(evidenceId),
      ) ||
      !representsSourcePost
    ) {
      throw new BadRequestException(
        'Listening attribution evidence is unavailable',
      );
    }

    return {
      listeningEvidenceIds,
      listeningThemeId,
      listeningTopicId,
    };
  }

  async attachIngredientToPost(
    postId: string,
    ingredientId: string,
    context: { organizationId: string; brandId: string },
  ) {
    const [post, ingredient] = await Promise.all([
      this.db.post.findFirst({
        include: { ingredients: { select: { id: true } } },
        where: scopedWhere(context.organizationId, {
          brandId: context.brandId,
          id: postId,
        }),
      }),
      this.db.ingredient.findFirst({
        select: { id: true },
        where: scopedWhere(context.organizationId, {
          brandId: context.brandId,
          id: ingredientId,
        }),
      }),
    ]);

    if (!post) {
      throw new NotFoundException({
        message: 'Post draft not found for image attachment',
      });
    }

    if (!ingredient) {
      throw new NotFoundException({
        message: 'Image ingredient not found for post attachment',
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
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: postId,
      }),
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
    query: { platform?: string; search?: string; sourceId?: string },
  ) {
    const where: Record<string, unknown> = scopedWhere(context.organizationId, {
      brandId: context.brandId,
    });

    if (query.platform) {
      where.platform = query.platform;
    }

    if (query.sourceId) {
      where.sourceId = query.sourceId;
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

function buildAttributionIdempotencyKey(
  sourcePostId: string,
  actionType: SourcePostDraftActionInput['actionType'],
  attribution: ListeningPostAttributionInput,
): string {
  const digest = createHash('sha256')
    .update(
      [
        sourcePostId,
        actionType ?? SourcePostActionType.DRAFT,
        attribution.listeningTopicId,
        attribution.listeningThemeId,
        ...attribution.listeningEvidenceIds,
      ].join(':'),
    )
    .digest('hex');
  return `listening-response:${digest}`;
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
        ? 'Quote'
        : actionType === SourcePostActionType.REPOST
          ? 'Repost'
          : 'Source draft';
  const handle = sourcePost.authorHandle
    ? `@${sourcePost.authorHandle}`
    : sourcePost.platform;
  return `${prefix}: ${handle}`.slice(0, 120);
}
