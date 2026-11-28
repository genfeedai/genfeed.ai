import { outlierBlockKey } from '@api/collections/outlier-library/outlier-creator-block.util';
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
const LEADING_AT = /^@/;

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Counts of a creator who has not authorized Genfeed are refreshed or deleted
 * within 30 days (YouTube Developer Policies III.E.4); the weekly read
 * refreshes them, and this is the longest a count outlives its read.
 */
const OUTLIER_COUNTS_MAX_AGE_DAYS = 30;
/** A listed post that two reads in a row no longer return is gone. */
const OUTLIER_POST_MISSED_READS_LIMIT = 2;
/** Weekly reads in a row that returned nothing before a creator is hidden. */
const OUTLIER_CREATOR_MISSED_READS_LIMIT = 2;
/** A post dropped from the list is deleted for good after this long. */
const OUTLIER_DROPPED_POST_PURGE_DAYS = 7;
const DROP_BATCH = 1_000;
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

    // A creator who asked to be removed stays out, whatever scrape finds them.
    const removed = await this.prisma.outlierCreator.findFirst({
      select: { id: true },
      where: {
        externalId: outlierBlockKey(input.platform, input.handle),
        platform: input.platform,
      },
    });
    if (removed) {
      return removed.id;
    }

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
   * Honours a removal request (#11644): the creator's posts are deleted, the
   * creator's row is scrubbed down to a block entry that holds a hash of the
   * platform and handle and nothing else, and no seed or read brings the
   * creator back. Asking twice, or for a creator never tracked, is fine: the
   * block is recorded either way.
   */
  async removeCreator(input: {
    handle: string;
    platform: OutlierLibraryPlatform;
  }): Promise<void> {
    if (!isLibraryPlatform(input.platform)) {
      throw new BadRequestException(
        `Outlier library does not track ${input.platform}`,
      );
    }
    const handle = input.handle.trim().replace(LEADING_AT, '');
    if (!handle) {
      throw new BadRequestException('A handle is required');
    }
    const blockKey = outlierBlockKey(input.platform, handle);
    const [block, live] = await Promise.all([
      this.prisma.outlierCreator.findFirst({
        select: { id: true },
        where: { externalId: blockKey, platform: input.platform },
      }),
      this.prisma.outlierCreator.findMany({
        select: { id: true },
        take: DROP_BATCH,
        where: {
          OR: [
            { externalId: handle.toLowerCase() },
            { handle: { equals: handle, mode: 'insensitive' } },
          ],
          platform: input.platform,
        },
      }),
    ]);
    const keep = block?.id ?? live[0]?.id;
    const drop = live.filter((row) => row.id !== keep).map((row) => row.id);
    const everyId = [...new Set([...live.map((row) => row.id), keep ?? ''])];
    const blocked = {
      displayName: null,
      externalId: blockKey,
      followersCount: null,
      handle: 'removed',
      isDeleted: true,
      lastReadAt: null,
      lastReadAttemptAt: null,
      medianViews: null,
      missedReads: 0,
      nicheTags: [],
      readClaimId: null,
      readClaimedUntil: null,
      sampleSize: 0,
      status: 'removed',
    };

    // The row first: a read that holds the creator makes this wait for it, and
    // a read that starts after it finds the creator removed.
    await this.prisma.$transaction([
      keep
        ? // // sql-risk-audit: ignore bulk-write-tenant-review -- outlier_creators and outlier_posts are platform tables with no tenant column; the where names the creator being removed or hidden.
          this.prisma.outlierCreator.updateMany({
            data: blocked,
            where: { id: keep },
          })
        : this.prisma.outlierCreator.createMany({
            data: [{ ...blocked, platform: input.platform }],
            skipDuplicates: true,
          }),
      // // sql-risk-audit: ignore bulk-write-tenant-review -- outlier_creators and outlier_posts are platform tables with no tenant column; the where names the creator being removed or hidden.
      this.prisma.outlierPost.deleteMany({
        where: { creatorId: { in: everyId } },
      }),
      // // sql-risk-audit: ignore bulk-write-tenant-review -- outlier_creators and outlier_posts are platform tables with no tenant column; the where names the creator being removed or hidden.
      this.prisma.outlierCreator.deleteMany({ where: { id: { in: drop } } }),
    ]);
  }

  /**
   * The retention sweep (#11644), run by the daily read job:
   * - a count not refreshed within 30 days is dropped from the list;
   * - a creator whose last weekly reads in a row returned nothing is hidden;
   * - a post dropped from the list is deleted for good once its counts are a
   *   week old.
   */
  async enforceRetention(now: Date = new Date()): Promise<{
    deletedPosts: number;
    hiddenCreators: number;
    staleCounts: number;
  }> {
    const staleCutoff = new Date(
      now.getTime() - OUTLIER_COUNTS_MAX_AGE_DAYS * DAY_MS,
    );
    const purgeCutoff = new Date(
      now.getTime() - OUTLIER_DROPPED_POST_PURGE_DAYS * DAY_MS,
    );

    const stale = await this.prisma.outlierPost.updateMany({
      data: { isDeleted: true },
      where: { countsReadAt: { lt: staleCutoff }, isDeleted: false },
    });

    const unreadable = await this.prisma.outlierCreator.findMany({
      select: { id: true },
      take: DROP_BATCH,
      where: {
        isDeleted: false,
        missedReads: { gte: OUTLIER_CREATOR_MISSED_READS_LIMIT },
        status: 'active',
      },
    });
    const unreadableIds = unreadable.map((row) => row.id);
    if (unreadableIds.length > 0) {
      await this.prisma.$transaction([
        // // sql-risk-audit: ignore bulk-write-tenant-review -- outlier_creators and outlier_posts are platform tables with no tenant column; the where names the creator being removed or hidden.
        this.prisma.outlierCreator.updateMany({
          data: { status: 'unreadable' },
          where: { id: { in: unreadableIds }, status: 'active' },
        }),
        this.prisma.outlierPost.updateMany({
          data: { isDeleted: true },
          where: { creatorId: { in: unreadableIds }, isDeleted: false },
        }),
      ]);
    }

    const purged = await this.prisma.outlierPost.deleteMany({
      where: { countsReadAt: { lt: purgeCutoff }, isDeleted: true },
    });

    return {
      deletedPosts: purged.count,
      hiddenCreators: unreadableIds.length,
      staleCounts: stale.count,
    };
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

    const isStillTracked = await this.writeListedRead({
      baseline,
      creator,
      creatorId,
      listed,
      median,
      now,
      posts,
    });
    if (!isStillTracked) {
      throw new BadRequestException('Outlier creator is not tracked');
    }

    return {
      creatorId,
      listedCount: listed.length,
      medianViews: median,
      sampleSize: baseline.sampleSize,
      status: baseline.status,
    };
  }

  /**
   * The write of one read, in one transaction. Returns false, having written
   * nothing, when the creator was removed after the read began.
   */
  private async writeListedRead({
    baseline,
    creator,
    creatorId,
    listed,
    median,
    now,
    posts,
  }: {
    baseline: { sampleSize: number };
    creator: { platform: string };
    creatorId: string;
    listed: ReadonlyArray<{
      input: OutlierLibraryPostInput;
      ratio: number;
      tier: OutlierLibraryTier;
    }>;
    median: number;
    now: Date;
    posts: readonly OutlierLibraryPostInput[];
  }): Promise<boolean> {
    const listedIds = listed.map(({ input }) => input.externalId);
    const returnedIds = posts.map((post) => post.externalId);
    return this.prisma.$transaction(async (transaction) => {
      // The first statement locks the creator's row, so a removal waits for
      // this read and a read that starts after a removal writes nothing.
      const tracked = await transaction.outlierCreator.updateMany({
        data: {
          lastReadAt: now,
          medianViews: median,
          sampleSize: baseline.sampleSize,
          status: 'active',
        },
        where: {
          id: creatorId,
          isDeleted: false,
          status: { not: 'removed' },
        },
      });
      if (tracked.count === 0) {
        return false;
      }
      // A post this read returned but no longer ranks is no longer an outlier.
      await transaction.outlierPost.updateMany({
        data: { isDeleted: true },
        where: {
          creatorId,
          externalId: { in: returnedIds, notIn: listedIds },
          isDeleted: false,
        },
      });
      // A post this read did not return at all: the first miss is kept in
      // case the read was partial, the second in a row drops it.
      await transaction.outlierPost.updateMany({
        data: { isDeleted: true },
        where: {
          creatorId,
          externalId: { notIn: returnedIds },
          isDeleted: false,
          missedReads: { gte: OUTLIER_POST_MISSED_READS_LIMIT - 1 },
        },
      });
      await transaction.outlierPost.updateMany({
        data: { missedReads: { increment: 1 } },
        where: {
          creatorId,
          externalId: { notIn: returnedIds },
          isDeleted: false,
        },
      });
      for (const { input, ratio, tier } of listed) {
        const fields = {
          captionExcerpt: toExcerpt(input.caption),
          comments: input.comments ?? null,
          countsReadAt: now,
          format: input.format ?? null,
          hashtags: [...new Set(input.hashtags ?? [])].slice(0, MAX_HASHTAGS),
          isDeleted: false,
          likes: input.likes ?? null,
          medianViews: median,
          missedReads: 0,
          outlierRatio: ratio,
          outlierTier: tier,
          publishedAt: input.publishedAt,
          sampleSize: baseline.sampleSize,
          soundId: input.soundId ?? null,
          url: input.url,
          views: input.views as number,
        };
        await transaction.outlierPost.upsert({
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
      }
      return true;
    });
  }

  /** Listed posts of readable creators, biggest multiple first. */
  async listOutliers(
    query: OutlierLibraryListQuery = {},
  ): Promise<OutlierLibraryPostRecord[]> {
    const limit = Math.min(
      MAX_LIST_LIMIT,
      Math.max(1, query.limit ?? DEFAULT_LIST_LIMIT),
    );
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
