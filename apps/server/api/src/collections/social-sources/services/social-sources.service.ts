import type { CreateSocialSourceDto } from '@api/collections/social-sources/dto/create-social-source.dto';
import type { ImportSocialPostDto } from '@api/collections/social-sources/dto/import-social-post.dto';
import type { SocialSourcesQueryDto } from '@api/collections/social-sources/dto/social-sources-query.dto';
import type { UpdateSocialSourceDto } from '@api/collections/social-sources/dto/update-social-source.dto';
import type {
  SocialPostImportDocumentResult,
  SocialSourceBrandSyncDocumentResult,
  SocialSourceDocument,
  SocialSourceSyncDocumentResult,
} from '@api/collections/social-sources/schemas/social-source.schema';
import type { SourcePostDocument } from '@api/collections/source-posts/schemas/source-post.schema';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { SourceCollectorService } from '@api/services/source-collector/source-collector.service';
import type {
  CollectedSourcePost,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  parseSocialPostUrl,
  SocialSourcePlatform,
  SocialSourceType,
  toPrismaCredentialPlatform,
} from '@genfeedai/enums';
import type { SocialSourceValidationResult } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

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
    private readonly sourceCollector: SourceCollectorService,
  ) {}

  async createScoped(
    dto: CreateSocialSourceDto,
    context: { organizationId: string; brandId: string; userId: string },
  ): Promise<SocialSourceDocument> {
    await this.ensureBrandAccess(context.organizationId, context.brandId);

    const platform = normalizePlatform(dto.platform);
    const handle = normalizeHandle(platform, dto.handle);
    await this.ensureCredentialAccess(dto.credentialId, context, platform);
    const source = await this.prisma.socialSource.create({
      data: {
        avatarUrl: dto.avatarUrl ?? null,
        bio: dto.bio ?? null,
        brandId: context.brandId,
        credentialId: dto.credentialId ?? null,
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
      this.prisma.socialSource.findMany({
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.socialSource.count({ where }),
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
        page: 1,
      }),
      this.sourcePostsService.listByBrand(context, {
        limit: query.postsLimit ?? 25,
        page: query.page,
        platform: query.platform,
        search: query.search,
        sourceId: query.sourceId,
      }),
    ]);
    const sources = sourcesResult.docs;
    const lastSyncedAt = sources
      .map((source) => source.lastSyncedAt)
      .filter((value): value is Date => value instanceof Date)
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
    const source = await this.prisma.socialSource.findFirst({
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id,
      }),
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
      : normalizePlatform(existing.platform);
    const handle = dto.handle
      ? normalizeHandle(platform, dto.handle)
      : undefined;

    const effectiveHandle = handle ?? existing.handle;
    if (dto.credentialId !== undefined || dto.platform !== undefined) {
      await this.ensureCredentialAccess(
        dto.credentialId ?? existing.credentialId ?? undefined,
        context,
        platform,
      );
    }
    const shouldRefreshProfileUrl =
      dto.profileUrl === undefined &&
      (dto.platform !== undefined || dto.handle !== undefined);

    return this.prisma.socialSource.update({
      data: {
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.credentialId !== undefined && {
          credentialId: dto.credentialId,
        }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.externalId !== undefined && { externalId: dto.externalId }),
        ...(dto.followersCount !== undefined && {
          followersCount: dto.followersCount,
        }),
        ...(handle !== undefined && { handle }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.platform !== undefined && { platform }),
        ...(dto.profileUrl !== undefined
          ? { profileUrl: dto.profileUrl }
          : shouldRefreshProfileUrl
            ? { profileUrl: buildProfileUrl(platform, effectiveHandle) }
            : {}),
        ...(dto.sourceType !== undefined && { sourceType: dto.sourceType }),
      },
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id,
      }),
    });
  }

  async removeScoped(
    id: string,
    context: { organizationId: string; brandId: string },
  ): Promise<SocialSourceDocument> {
    await this.findOneScoped(id, context);
    return this.prisma.socialSource.update({
      data: { isActive: false, isDeleted: true },
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id,
      }),
    });
  }

  async validateSource(
    platformInput: string,
    handleInput: string,
  ): Promise<SocialSourceValidationResult> {
    const platform = normalizePlatform(platformInput);
    const handle = normalizeHandle(platform, handleInput);
    try {
      // Following validates with replies included so reply-heavy accounts still match.
      const collected = await this.sourceCollector.collectTimeline(
        platform,
        handle,
        {
          includeReplies: true,
          includeReposts: false,
          limit: 3,
        },
      );

      if (!collected.posts.length) {
        return {
          error: 'Source not found or has no recent posts',
          valid: false,
        };
      }

      const firstPost = collected.posts[0];
      return {
        avatarUrl: firstPost.authorAvatarUrl,
        displayName: firstPost.authorDisplayName,
        externalId: firstPost.authorId,
        followersCount: firstPost.authorFollowersCount,
        handle: firstPost.authorUsername || handle,
        platform,
        profileUrl: buildProfileUrl(
          platform,
          firstPost.authorUsername || handle,
        ),
        valid: true,
      };
    } catch (error: unknown) {
      const message =
        (error as Error)?.message ?? 'Failed to look up social source';
      this.logger.error('Social source validate failed', {
        error: message,
        handle,
        platform,
      });
      return { error: message, valid: false };
    }
  }

  async syncSource(
    id: string,
    context: { organizationId: string; brandId: string },
    options: { limit?: number } = {},
  ): Promise<SocialSourceSyncDocumentResult> {
    const source = await this.findOneScoped(id, context);
    if (source.sourceType === SocialSourceType.POST) {
      throw new BadRequestException(
        'Imported posts have no timeline sync — re-import the post URL to refresh its metrics',
      );
    }
    return this.syncResolvedSource(source, options);
  }

  /**
   * Import exactly one post by URL as a source item (issue #2660).
   *
   * The URL is parsed into `{ platform, postId }` — never fetched raw — then
   * the post is collected through the existing provider chain. Re-importing a
   * URL that already exists for this org/brand deduplicates onto the existing
   * item and refreshes its metrics snapshot.
   */
  async importPostScoped(
    dto: ImportSocialPostDto,
    context: { organizationId: string; brandId: string; userId: string },
  ): Promise<SocialPostImportDocumentResult> {
    const reference = parseSocialPostUrl(dto.url);
    if (!reference) {
      throw new BadRequestException(
        'URL is not a recognizable X, Instagram, or TikTok post link',
      );
    }

    await this.ensureBrandAccess(context.organizationId, context.brandId);

    let collected: SourceCollectResult;
    try {
      collected = await this.sourceCollector.collectPost(reference, {
        brandId: context.brandId,
        organizationId: context.organizationId,
      });
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to fetch post';
      this.logger.error('Social post import fetch failed', {
        error: message,
        platform: reference.platform,
        postId: reference.postId,
      });
      if (/not found|deleted|private|incomplete/i.test(message)) {
        throw new NotFoundException({
          message:
            'Post could not be resolved — it may be deleted, private, or the link is wrong',
        });
      }
      throw new BadRequestException(`Post import failed: ${message}`);
    }

    const collectedPost = collected.posts[0];
    if (!hasStableCollectedPostIdentifier(collectedPost)) {
      throw new BadRequestException(
        'Collected post is missing a stable external identifier',
      );
    }
    const externalId = collectedPost.id.trim();
    const existing = await this.sourcePostsService.findByExternalIdScoped(
      context,
      reference.platform,
      externalId,
    );

    // Reuse the existing item's source; fall back to an import container when
    // the original source was since removed.
    const existingSource = existing
      ? await this.prisma.socialSource.findFirst({
          where: scopedWhere(context.organizationId, {
            brandId: context.brandId,
            id: existing.sourceId,
          }),
        })
      : null;
    const source =
      existingSource ??
      (await this.resolveImportContainer(reference, collectedPost, context));

    const normalized = normalizeCollectedPost(source, {
      ...collectedPost,
      id: externalId,
    });
    const { posts } = await this.sourcePostsService.upsertCollectedPosts(
      source,
      [{ ...normalized, sourceUrl: normalized.sourceUrl ?? reference.url }],
    );

    this.logger.log('Social post imported', {
      deduplicated: Boolean(existing),
      platform: reference.platform,
      postId: collectedPost.id,
      provider: collected.provider,
      sourceId: source.id,
    });

    return {
      deduplicated: Boolean(existing),
      post: posts[0],
      source,
    };
  }

  /**
   * Find or create the per-author container source (`sourceType: post`) that
   * imported posts hang off. Containers are inactive so brand timeline sync
   * never picks them up.
   */
  private async resolveImportContainer(
    reference: NonNullable<ReturnType<typeof parseSocialPostUrl>>,
    collectedPost: CollectedSourcePost,
    context: { organizationId: string; brandId: string; userId: string },
  ): Promise<SocialSourceDocument> {
    const handle = (
      collectedPost.authorUsername ||
      reference.authorHandle ||
      'unknown'
    )
      .replace(/^@/, '')
      .toLowerCase();

    const existingContainer = await this.prisma.socialSource.findFirst({
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        handle,
        platform: reference.platform,
        sourceType: SocialSourceType.POST,
      }),
    });
    if (existingContainer) {
      return existingContainer;
    }

    return this.prisma.socialSource.create({
      data: {
        avatarUrl: collectedPost.authorAvatarUrl ?? null,
        bio: null,
        brandId: context.brandId,
        credentialId: null,
        displayName: collectedPost.authorDisplayName ?? null,
        externalId: collectedPost.authorId ?? null,
        followersCount: collectedPost.authorFollowersCount ?? null,
        handle,
        isActive: false,
        metadata: {},
        organizationId: context.organizationId,
        platform: reference.platform,
        profileUrl:
          handle === 'unknown'
            ? null
            : buildProfileUrl(reference.platform, handle),
        sourceType: SocialSourceType.POST,
        userId: context.userId,
      },
    });
  }

  async syncBrand(
    context: { organizationId: string; brandId: string },
    options: { limit?: number } = {},
  ): Promise<SocialSourceBrandSyncDocumentResult> {
    const sources = await this.prisma.socialSource.findMany({
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        isActive: true,
      }),
    });

    const results: SocialSourceSyncDocumentResult[] = [];
    const failures: Array<{ error: string; sourceId: string }> = [];
    for (const source of sources) {
      try {
        results.push(await this.syncResolvedSource(source, options));
      } catch (error: unknown) {
        failures.push({
          error: (error as Error)?.message ?? 'Source sync failed',
          sourceId: source.id,
        });
      }
    }

    return {
      count: results.reduce((total, result) => total + result.count, 0),
      failures,
      results,
    };
  }

  private async syncResolvedSource(
    source: SocialSourceDocument,
    options: { limit?: number },
  ): Promise<SocialSourceSyncDocumentResult> {
    try {
      // Following wants originals + replies; pure RTs stay out by default.
      // SourceCollector: brand OAuth → app bearer → Apify (per platform).
      const collected = await this.sourceCollector.collectTimeline(
        normalizePlatform(source.platform),
        source.handle,
        {
          brandId: source.brandId,
          includeReplies: true,
          includeReposts: false,
          limit: Math.min(100, Math.max(1, options.limit ?? 25)),
          organizationId: source.organizationId,
          sinceId: source.lastPostExternalId ?? undefined,
        },
      );
      this.logger.log('Social source collected', {
        count: collected.posts.length,
        provider: collected.provider,
        sourceId: source.id,
      });
      const normalizedPosts = collected.posts.map((item) =>
        normalizeCollectedPost(source, item),
      );
      const { posts, rejectedCount } =
        await this.sourcePostsService.upsertCollectedPosts(
          source,
          normalizedPosts,
        );
      const latestPost = posts[0];
      const rejectedPostMessage =
        rejectedCount > 0
          ? `Skipped ${rejectedCount} collected ${rejectedCount === 1 ? 'post' : 'posts'} without a stable external identifier`
          : null;
      const updatedSource = await this.prisma.socialSource.update({
        data: {
          avatarUrl: latestPost?.authorAvatarUrl ?? source.avatarUrl,
          displayName:
            latestPost?.authorDisplayName ??
            source.displayName ??
            source.handle,
          externalId: latestPost?.authorId ?? source.externalId,
          followersCount:
            latestPost?.authorFollowersCount ?? source.followersCount,
          lastPostExternalId:
            latestPost?.externalId ?? source.lastPostExternalId,
          lastSyncError:
            rejectedPostMessage ??
            (posts.length === 0
              ? 'Sync completed but no posts were collected'
              : null),
          lastSyncStatus: posts.length === 0 ? 'empty' : 'success',
          lastSyncedAt: new Date(),
          profileUrl: buildProfileUrl(
            source.platform,
            latestPost?.authorHandle || source.handle,
          ),
        },
        where: scopedWhere(source.organizationId, {
          brandId: source.brandId,
          id: source.id,
        }),
      });

      return {
        count: posts.length,
        posts,
        rejectedCount,
        source: updatedSource,
      };
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to sync source';
      this.logger.error('Failed to sync social source', {
        error: message,
        sourceId: source.id,
      });
      await this.prisma.socialSource.update({
        data: {
          lastSyncError: message,
          lastSyncStatus: 'failed',
          lastSyncedAt: new Date(),
        },
        where: scopedWhere(source.organizationId, {
          brandId: source.brandId,
          id: source.id,
        }),
      });
      throw error;
    }
  }

  private async ensureBrandAccess(
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      where: scopedWhere(organizationId, { id: brandId }),
    });
    if (!brand) {
      throw new BadRequestException(
        'Brand is not available in this organization',
      );
    }
  }

  private async ensureCredentialAccess(
    credentialId: string | undefined,
    context: { organizationId: string; brandId: string },
    platform: SocialSourcePlatform,
  ): Promise<void> {
    if (!credentialId) {
      return;
    }

    const credentialPlatform = toPrismaCredentialPlatform(platform);
    if (!credentialPlatform) {
      throw new BadRequestException(
        `Unsupported credential platform: ${platform}`,
      );
    }

    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(context.organizationId, {
        brandId: context.brandId,
        id: credentialId,
        platform: credentialPlatform,
      }),
    });
    if (!credential) {
      throw new BadRequestException(
        'Credential is not available for this brand and platform',
      );
    }
  }

  private buildScopedWhere(
    context: { organizationId: string; brandId: string },
    query: Pick<SocialSourcesQueryDto, 'isActive' | 'platform' | 'search'>,
  ) {
    const where: Record<string, unknown> = scopedWhere(context.organizationId, {
      brandId: context.brandId,
    });

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
      // Regression guard (#2660): a URL with a post identifier must never
      // silently degrade into following the whole account.
      if (parseSocialPostUrl(trimmed)) {
        throw new BadRequestException(
          'This link points to a specific post — use "Import post" instead, or enter the account handle to follow the account',
        );
      }
      const url = new URL(trimmed);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      const allowedHosts = getPlatformHosts(platform);
      if (!allowedHosts.includes(hostname)) {
        throw new BadRequestException(
          `Profile URL must use ${allowedHosts.join(' or ')}`,
        );
      }
      const path = url.pathname.split('/').find(Boolean);
      if (!path || path === '@') {
        throw new BadRequestException('Profile URL must include a handle');
      }
      return normalizeHandle(platform, path);
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException('Profile URL is invalid');
  }

  const handle = trimmed
    .replace(/^@/, '')
    .replace(/^\/+/, '')
    .trim()
    .toLowerCase();
  if (!handle) {
    throw new BadRequestException('Social source handle is required');
  }
  return handle;
}

function getPlatformHosts(platform: string): string[] {
  switch (platform) {
    case SocialSourcePlatform.INSTAGRAM:
      return ['instagram.com'];
    case SocialSourcePlatform.TIKTOK:
      return ['tiktok.com'];
    case SocialSourcePlatform.TWITTER:
      return ['x.com', 'twitter.com'];
    default:
      throw new BadRequestException(`Unsupported source platform: ${platform}`);
  }
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

function normalizeCollectedPost(
  source: SocialSourceDocument,
  item: CollectedSourcePost,
) {
  return {
    authorAvatarUrl: item.authorAvatarUrl ?? null,
    authorDisplayName: item.authorDisplayName ?? null,
    authorFollowersCount: item.authorFollowersCount ?? null,
    authorHandle: item.authorUsername,
    authorId: item.authorId,
    brandId: source.brandId,
    contentType: item.contentType ?? 'post',
    externalId: item.id,
    hashtags: item.hashtags ?? [],
    mediaUrls: item.mediaUrls ?? [],
    metrics: item.metrics ?? {},
    organizationId: source.organizationId,
    platform: item.platform,
    publishedAt: item.createdAt ? new Date(item.createdAt) : null,
    raw: item as unknown as Record<string, unknown>,
    sourceId: source.id,
    sourceUrl: item.contentUrl ?? null,
    text: item.text,
    thumbnailUrl: item.thumbnailUrl ?? null,
    userId: source.userId,
  };
}

function hasStableCollectedPostIdentifier(
  post: CollectedSourcePost | undefined,
): post is CollectedSourcePost {
  return typeof post?.id === 'string' && post.id.trim().length > 0;
}
