import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  OUTLIER_LIBRARY_PLATFORMS,
  type OutlierLibraryCreatorInput,
  type OutlierLibraryListQuery,
  type OutlierLibraryPlatform,
  type OutlierLibraryPostInput,
  type OutlierLibraryPostRecord,
  type OutlierLibraryReadResult,
  type OutlierLibraryTier,
} from '@genfeedai/contracts/interfaces';
import { computeOutlierBaseline } from '@genfeedai/helpers';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

/** The baseline helper wants a scope; library rows belong to the platform. */
const PLATFORM_SCOPE = 'platform';
const CONTENT_TYPE = 'video';

const MAX_CAPTION_EXCERPT = 140;
const MAX_HASHTAGS = 30;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

/** Likes under this share of views, from 1,000 views, look like bought reach. */
const BOUGHT_REACH_MIN_VIEWS = 1_000;
const BOUGHT_REACH_MAX_LIKE_RATE = 0.005;

function isBoughtReach(post: OutlierLibraryPostInput): boolean {
  if (post.isPromoted === true) {
    return true;
  }
  return (
    post.views !== null &&
    post.views >= BOUGHT_REACH_MIN_VIEWS &&
    typeof post.likes === 'number' &&
    post.likes / post.views < BOUGHT_REACH_MAX_LIKE_RATE
  );
}

function toExcerpt(caption: string | null | undefined): string | null {
  const text = caption?.replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }
  return text.length > MAX_CAPTION_EXCERPT
    ? `${text.slice(0, MAX_CAPTION_EXCERPT - 1)}…`
    : text;
}

function isLibraryPlatform(value: string): value is OutlierLibraryPlatform {
  return (OUTLIER_LIBRARY_PLATFORMS as readonly string[]).includes(value);
}

/**
 * The shared store of other creators' outlier posts (#11641). Rows have no
 * tenant column: one creator followed by ten organizations is one row, read
 * once. Numbers, links and a short caption excerpt only; never a video file.
 */
@Traced()
@Injectable()
export class OutlierLibraryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registers a creator, or returns the one that already exists. Calling it
   * for the same creator from two organizations, or twice at once, leaves
   * one row. A creator who asked to be removed is never reactivated.
   */
  async trackCreator(input: OutlierLibraryCreatorInput): Promise<string> {
    if (!isLibraryPlatform(input.platform)) {
      throw new BadRequestException(
        `Outlier library does not track ${input.platform}`,
      );
    }
    const externalId = input.externalId.trim();
    const handle = input.handle.trim();
    if (!externalId || !handle) {
      throw new BadRequestException('A creator needs an id and a handle');
    }
    const nicheTags = [...new Set(input.nicheTags ?? [])];

    // ON CONFLICT DO NOTHING: two organizations asking at once leave one row.
    await this.prisma.outlierCreator.createMany({
      data: [
        {
          displayName: input.displayName ?? null,
          externalId,
          followersCount: input.followersCount ?? null,
          handle,
          nicheTags,
          platform: input.platform,
        },
      ],
      skipDuplicates: true,
    });
    const creator = await this.prisma.outlierCreator.findUniqueOrThrow({
      select: { id: true, nicheTags: true, status: true },
      where: { platform_externalId: { externalId, platform: input.platform } },
    });
    if (creator.status === 'removed') {
      return creator.id;
    }

    const missingTags = nicheTags.filter(
      (tag) => !creator.nicheTags.includes(tag),
    );
    await this.prisma.outlierCreator.update({
      data: {
        displayName: input.displayName ?? undefined,
        followersCount: input.followersCount ?? undefined,
        handle,
        ...(missingTags.length > 0
          ? { nicheTags: [...creator.nicheTags, ...missingTags] }
          : {}),
      },
      where: { id: creator.id },
    });
    return creator.id;
  }

  /**
   * Stores one read of a creator: computes the creator's typical post with the
   * same baseline Analytics > Outliers uses, lists every post at the outlier
   * threshold or more, and drops from the list a post that fell below it.
   * A read with too few settled posts to know a typical post changes nothing
   * beyond when it was read, so an empty or thin read never wipes good numbers.
   */
  async recordRead(
    creatorId: string,
    posts: readonly OutlierLibraryPostInput[],
    now: Date = new Date(),
  ): Promise<OutlierLibraryReadResult> {
    const creator = await this.prisma.outlierCreator.findFirst({
      select: { id: true, platform: true, status: true },
      where: { id: creatorId, isDeleted: false },
    });
    if (!creator || creator.status === 'removed') {
      throw new BadRequestException('Outlier creator is not tracked');
    }

    const baseline = computeOutlierBaseline({
      nowMs: now.getTime(),
      posts: posts.map((post) => ({
        accountId: creatorId,
        contentType: CONTENT_TYPE,
        id: post.externalId,
        isDeleted: false,
        isPinned: post.isPinned ?? null,
        isPromoted: post.isPromoted ?? null,
        organizationId: PLATFORM_SCOPE,
        platform: creator.platform,
        publishedAtMs: post.publishedAt.getTime(),
        views: post.views,
      })),
      scope: {
        accountId: creatorId,
        contentType: CONTENT_TYPE,
        organizationId: PLATFORM_SCOPE,
        platform: creator.platform,
      },
    });

    if (baseline.status !== 'ready' || baseline.median === null) {
      await this.prisma.outlierCreator.update({
        data: { lastReadAt: now },
        where: { id: creatorId },
      });
      const listedCount = await this.prisma.outlierPost.count({
        where: { creatorId, isDeleted: false },
      });
      return {
        creatorId,
        listedCount,
        medianViews: null,
        sampleSize: baseline.sampleSize,
        status: baseline.status,
      };
    }

    const median = baseline.median;
    const results = new Map(baseline.posts.map((post) => [post.id, post]));
    const listed: Array<{
      input: OutlierLibraryPostInput;
      ratio: number;
      tier: OutlierLibraryTier;
    }> = [];
    for (const input of posts) {
      const result = results.get(input.externalId);
      if (!result?.tier || result.ratio === null || input.views === null) {
        continue;
      }
      if (isBoughtReach(input)) {
        continue;
      }
      listed.push({ input, ratio: result.ratio, tier: result.tier });
    }

    const listedIds = listed.map(({ input }) => input.externalId);
    await this.prisma.$transaction([
      // A post this read no longer lists is no longer an outlier.
      this.prisma.outlierPost.updateMany({
        data: { isDeleted: true },
        where: {
          creatorId,
          externalId: { notIn: listedIds },
          isDeleted: false,
        },
      }),
      ...listed.map(({ input, ratio, tier }) => {
        const fields = {
          captionExcerpt: toExcerpt(input.caption),
          comments: input.comments ?? null,
          countsReadAt: now,
          format: input.format ?? null,
          hashtags: [...new Set(input.hashtags ?? [])].slice(0, MAX_HASHTAGS),
          isDeleted: false,
          likes: input.likes ?? null,
          medianViews: median,
          outlierRatio: ratio,
          outlierTier: tier,
          publishedAt: input.publishedAt,
          sampleSize: baseline.sampleSize,
          soundId: input.soundId ?? null,
          url: input.url,
          views: input.views as number,
        };
        return this.prisma.outlierPost.upsert({
          create: {
            ...fields,
            creatorId,
            externalId: input.externalId,
            platform: creator.platform,
          },
          update: fields,
          where: {
            platform_externalId: {
              externalId: input.externalId,
              platform: creator.platform,
            },
          },
        });
      }),
      this.prisma.outlierCreator.update({
        data: {
          lastReadAt: now,
          medianViews: median,
          sampleSize: baseline.sampleSize,
          status: 'active',
        },
        where: { id: creatorId },
      }),
    ]);

    return {
      creatorId,
      listedCount: listed.length,
      medianViews: median,
      sampleSize: baseline.sampleSize,
      status: baseline.status,
    };
  }

  /** Listed posts of readable creators, biggest multiple first. */
  async listOutliers(
    query: OutlierLibraryListQuery = {},
  ): Promise<OutlierLibraryPostRecord[]> {
    const limit = Math.min(
      MAX_LIST_LIMIT,
      Math.max(1, query.limit ?? DEFAULT_LIST_LIMIT),
    );
    const activeCreators = await this.prisma.outlierCreator.findMany({
      select: { id: true },
      where: {
        isDeleted: false,
        status: 'active',
        ...(query.platform ? { platform: query.platform } : {}),
      },
    });
    const rows = await this.prisma.outlierPost.findMany({
      include: {
        creator: {
          select: {
            displayName: true,
            followersCount: true,
            handle: true,
            id: true,
          },
        },
      },
      orderBy: [
        { outlierRatio: 'desc' },
        { publishedAt: 'desc' },
        { id: 'asc' },
      ],
      skip: Math.max(0, query.offset ?? 0),
      take: limit,
      where: {
        creatorId: { in: activeCreators.map((creator) => creator.id) },
        isDeleted: false,
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.tier ? { outlierTier: query.tier } : {}),
      },
    });

    return rows.map((row) => ({
      captionExcerpt: row.captionExcerpt,
      comments: row.comments,
      countsReadAt: row.countsReadAt,
      creator: row.creator,
      externalId: row.externalId,
      format: row.format,
      hashtags: row.hashtags,
      id: row.id,
      likes: row.likes,
      medianViews: row.medianViews,
      outlierRatio: row.outlierRatio,
      outlierTier: row.outlierTier as OutlierLibraryTier,
      platform: row.platform as OutlierLibraryPlatform,
      publishedAt: row.publishedAt,
      sampleSize: row.sampleSize,
      soundId: row.soundId,
      url: row.url,
      views: row.views,
    }));
  }
}
