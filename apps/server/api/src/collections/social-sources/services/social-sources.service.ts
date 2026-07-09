import type { CreateSocialSourceDto } from '@api/collections/social-sources/dto/create-social-source.dto';
import type { SocialSourcesQueryDto } from '@api/collections/social-sources/dto/social-sources-query.dto';
import type { UpdateSocialSourceDto } from '@api/collections/social-sources/dto/update-social-source.dto';
import type { SocialSourceDocument } from '@api/collections/social-sources/schemas/social-source.schema';
import type { SourcePostDocument } from '@api/collections/source-posts/schemas/source-post.schema';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type { SocialContentData } from '@api/services/reply-bot/social-monitor.service';
import { SocialMonitorService } from '@api/services/reply-bot/social-monitor.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ReplyBotPlatform,
  SocialSourcePlatform,
  SocialSourceType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type PrismaDelegate<T> = {
  count: (args?: Record<string, unknown>) => Promise<number>;
  create: (args: Record<string, unknown>) => Promise<T>;
  findFirst: (args?: Record<string, unknown>) => Promise<T | null>;
  findMany: (args?: Record<string, unknown>) => Promise<T[]>;
  update: (args: Record<string, unknown>) => Promise<T>;
};

type PrismaWithSocialSources = PrismaService & {
  brand: PrismaDelegate<{ id: string }>;
  socialSource: PrismaDelegate<SocialSourceDocument>;
};

export interface SocialSourcesFeedResult {
  sources: SocialSourceDocument[];
  posts: SourcePostDocument[];
  summary: {
    totalSources: number;
    activeSources: number;
    totalPosts: number;
    lastSyncedAt?: string | null;
  };
}

@Injectable()
export class SocialSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly sourcePostsService: SourcePostsService,
    private readonly socialMonitorService: SocialMonitorService,
  ) {}

  private get db(): PrismaWithSocialSources {
    return this.prisma as PrismaWithSocialSources;
  }

  async createScoped(
    dto: CreateSocialSourceDto,
    context: { organizationId: string; brandId: string; userId: string },
  ): Promise<SocialSourceDocument> {
    await this.ensureBrandAccess(context.organizationId, context.brandId);

    const platform = normalizePlatform(dto.platform);
    const handle = normalizeHandle(platform, dto.handle);
    const source = await this.db.socialSource.create({
      data: {
        avatarUrl: dto.avatarUrl ?? null,
        bio: dto.bio ?? null,
        brandId: context.brandId,
        credentialId: dto.credential ?? null,
        displayName: dto.displayName ?? null,
        externalId: dto.externalId ?? null,
        followersCount: dto.followersCount ?? null,
        handle,
        isActive: dto.isActive ?? true,
        metadata: {},
        organizationId: context.organizationId,
        platform,
        profileUrl: dto.profileUrl ?? buildProfileUrl(platform, handle),
        sourceType: dto.sourceType ?? SocialSourceType.ACCOUNT,
        userId: context.userId,
      },
    });

    return source;
  }

  async findAllScoped(
    context: { organizationId: string; brandId: string },
    query: SocialSourcesQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const where = this.buildScopedWhere(context, query);
    const [docs, total] = await Promise.all([
      this.db.socialSource.findMany({
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.db.socialSource.count({ where }),
    ]);

    return {
      docs,
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async getFeed(
    context: { organizationId: string; brandId: string },
    query: SocialSourcesQueryDto,
  ): Promise<SocialSourcesFeedResult> {
    const [sourcesResult, postsResult] = await Promise.all([
      this.findAllScoped(context, {
        ...query,
        limit: 100,
        pagination: false,
      }),
      this.sourcePostsService.listByBrand(context, {
        limit: query.postsLimit ?? 25,
        page: query.page,
        platform: query.platform,
        search: query.search,
        source: query.source,
      }),
    ]);
    const sources = sourcesResult.docs;
    const lastSyncedAt = sources
      .map((source) => source.lastSyncedAt)
      .filter((value): value is Date | string => Boolean(value))
      .map((value) => new Date(value).toISOString())
      .sort()
      .at(-1);

    return {
      posts: postsResult.docs,
      sources,
      summary: {
        activeSources: sources.filter((source) => source.isActive).length,
        lastSyncedAt: lastSyncedAt ?? null,
        totalPosts: postsResult.total,
        totalSources: sourcesResult.total,
      },
    };
  }

  async findOneScoped(
    id: string,
    context: { organizationId: string; brandId: string },
  ): Promise<SocialSourceDocument> {
    const source = await this.db.socialSource.findFirst({
      where: {
        brandId: context.brandId,
        id,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });

    if (!source) {
      throw new NotFoundException({ message: 'Social source not found' });
    }

    return source;
  }

  async updateScoped(
    id: string,
    dto: UpdateSocialSourceDto,
    context: { organizationId: string; brandId: string },
  ): Promise<SocialSourceDocument> {
    const existing = await this.findOneScoped(id, context);
    const platform = dto.platform
      ? normalizePlatform(dto.platform)
      : existing.platform;
    const handle = dto.handle
      ? normalizeHandle(platform, dto.handle)
      : undefined;

    return this.db.socialSource.update({
      data: {
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.credential !== undefined && { credentialId: dto.credential }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.externalId !== undefined && { externalId: dto.externalId }),
        ...(dto.followersCount !== undefined && {
          followersCount: dto.followersCount,
        }),
        ...(handle !== undefined && { handle }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.platform !== undefined && { platform }),
        ...(dto.profileUrl !== undefined && { profileUrl: dto.profileUrl }),
        ...(dto.sourceType !== undefined && { sourceType: dto.sourceType }),
      },
      where: { id },
    });
  }

  async removeScoped(
    id: string,
    context: { organizationId: string; brandId: string },
  ): Promise<SocialSourceDocument> {
    await this.findOneScoped(id, context);
    return this.db.socialSource.update({
      data: { isActive: false, isDeleted: true },
      where: { id },
    });
  }

  async validateSource(platformInput: string, handleInput: string) {
    const platform = normalizePlatform(platformInput);
    const handle = normalizeHandle(platform, handleInput);
    const posts = await this.socialMonitorService.getUserTimeline(
      toReplyBotPlatform(platform),
      handle,
      { limit: 1 },
    );

    if (!posts.length) {
      return { error: 'Source not found or has no recent posts', valid: false };
    }

    const firstPost = posts[0];
    return {
      avatarUrl: firstPost.authorAvatarUrl,
      displayName: firstPost.authorDisplayName,
      externalId: firstPost.authorId,
      followersCount: firstPost.authorFollowersCount,
      handle: firstPost.authorUsername || handle,
      platform,
      profileUrl: buildProfileUrl(platform, firstPost.authorUsername || handle),
      valid: true,
    };
  }

  async syncSource(
    id: string,
    context: { organizationId: string; brandId: string },
    options: { limit?: number } = {},
  ) {
    const source = await this.findOneScoped(id, context);
    return this.syncResolvedSource(source, options);
  }

  async syncBrand(
    context: { organizationId: string; brandId: string },
    options: { limit?: number } = {},
  ) {
    const sources = await this.db.socialSource.findMany({
      where: {
        brandId: context.brandId,
        isActive: true,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });

    const results = [];
    for (const source of sources) {
      results.push(await this.syncResolvedSource(source, options));
    }

    return {
      count: results.reduce((total, result) => total + result.count, 0),
      results,
    };
  }

  private async syncResolvedSource(
    source: SocialSourceDocument,
    options: { limit?: number },
  ) {
    try {
      const content = await this.socialMonitorService.getUserTimeline(
        toReplyBotPlatform(source.platform),
        source.handle,
        {
          limit: Math.min(100, Math.max(1, options.limit ?? 25)),
          sinceId: source.lastPostExternalId ?? undefined,
        },
      );
      const normalizedPosts = content.map((item) =>
        normalizeSourceContent(source, item),
      );
      const posts = await this.sourcePostsService.upsertCollectedPosts(
        source as Required<
          Pick<
            SocialSourceDocument,
            | 'brandId'
            | 'handle'
            | 'id'
            | 'organizationId'
            | 'platform'
            | 'userId'
          >
        >,
        normalizedPosts,
      );
      const latestPost = content[0];
      const updatedSource = await this.db.socialSource.update({
        data: {
          avatarUrl: latestPost?.authorAvatarUrl ?? source.avatarUrl,
          displayName:
            latestPost?.authorDisplayName ??
            source.displayName ??
            source.handle,
          externalId: latestPost?.authorId ?? source.externalId,
          followersCount:
            latestPost?.authorFollowersCount ?? source.followersCount,
          lastPostExternalId: latestPost?.id ?? source.lastPostExternalId,
          lastSyncError: null,
          lastSyncStatus: 'success',
          lastSyncedAt: new Date(),
          profileUrl: buildProfileUrl(
            source.platform,
            latestPost?.authorUsername || source.handle,
          ),
        },
        where: { id: source.id },
      });

      return { count: posts.length, posts, source: updatedSource };
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to sync source';
      this.logger.error('Failed to sync social source', {
        error: message,
        sourceId: source.id,
      });
      await this.db.socialSource.update({
        data: {
          lastSyncError: message,
          lastSyncStatus: 'failed',
          lastSyncedAt: new Date(),
        },
        where: { id: source.id },
      });
      throw error;
    }
  }

  private async ensureBrandAccess(
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    const brand = await this.db.brand.findFirst({
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (!brand) {
      throw new BadRequestException(
        'Brand is not available in this organization',
      );
    }
  }

  private buildScopedWhere(
    context: { organizationId: string; brandId: string },
    query: Pick<SocialSourcesQueryDto, 'isActive' | 'platform' | 'search'>,
  ) {
    const where: Record<string, unknown> = {
      brandId: context.brandId,
      isDeleted: false,
      organizationId: context.organizationId,
    };

    if (query.platform) {
      where.platform = normalizePlatform(query.platform);
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { handle: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }
}

function normalizePlatform(platform: string): SocialSourcePlatform {
  if (
    platform === SocialSourcePlatform.TWITTER ||
    platform === SocialSourcePlatform.INSTAGRAM ||
    platform === SocialSourcePlatform.TIKTOK
  ) {
    return platform;
  }
  throw new BadRequestException(`Unsupported source platform: ${platform}`);
}

function normalizeHandle(platform: string, input: string): string {
  const trimmed = input.trim();
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const path = url.pathname
        .split('/')
        .filter(Boolean)
        .find((segment) => segment !== '@');
      return normalizeHandle(platform, path ?? trimmed);
    }
  } catch {
    // Fall through to string normalization.
  }

  return trimmed.replace(/^@/, '').replace(/^\/+/, '').trim().toLowerCase();
}

function buildProfileUrl(platform: string, handle: string): string {
  const cleanHandle = normalizeHandle(platform, handle);
  switch (platform) {
    case SocialSourcePlatform.INSTAGRAM:
      return `https://www.instagram.com/${cleanHandle}`;
    case SocialSourcePlatform.TIKTOK:
      return `https://www.tiktok.com/@${cleanHandle}`;
    default:
      return `https://x.com/${cleanHandle}`;
  }
}

function toReplyBotPlatform(platform: string): ReplyBotPlatform {
  switch (platform) {
    case SocialSourcePlatform.INSTAGRAM:
      return ReplyBotPlatform.INSTAGRAM;
    case SocialSourcePlatform.TIKTOK:
      return ReplyBotPlatform.TIKTOK;
    case SocialSourcePlatform.TWITTER:
      return ReplyBotPlatform.TWITTER;
    default:
      throw new BadRequestException(`Unsupported source platform: ${platform}`);
  }
}

function normalizeSourceContent(
  source: SocialSourceDocument,
  item: SocialContentData,
) {
  return {
    authorAvatarUrl: item.authorAvatarUrl ?? null,
    authorDisplayName: item.authorDisplayName ?? null,
    authorFollowersCount: item.authorFollowersCount ?? null,
    authorHandle: item.authorUsername,
    authorId: item.authorId,
    brandId: source.brandId,
    contentType: item.contentType,
    externalId: item.id,
    hashtags: item.hashtags ?? [],
    mediaUrls: [],
    metrics: item.metrics ?? {},
    organizationId: source.organizationId,
    platform: item.platform,
    publishedAt: item.createdAt ? new Date(item.createdAt) : null,
    raw: item as unknown as Record<string, unknown>,
    sourceId: source.id,
    sourceUrl: item.contentUrl ?? null,
    text: item.text,
    thumbnailUrl: null,
    userId: source.userId,
  };
}
