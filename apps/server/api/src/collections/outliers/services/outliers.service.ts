import { createHash } from 'node:crypto';
import { OutlierConfigurationService } from '@api/collections/outliers/services/outlier-configuration.service';
import { OutlierInputsService } from '@api/collections/outliers/services/outlier-inputs.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  OutlierAccountScope,
  OutlierConfigurationValues,
  OutlierListQuery,
  OutlierObservation,
  OutlierRankedPostsQuery,
  OutlierResolvedAccount,
} from '@genfeedai/contracts/interfaces';
import { computeOutlierBaseline } from '@genfeedai/helpers';
import type { OutlierBaselineSnapshot, Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class OutliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inputs: OutlierInputsService,
    private readonly configuration: OutlierConfigurationService,
  ) {}
  authorize(scope: OutlierAccountScope) {
    return this.inputs.authorize(scope);
  }
  async refresh(scope: OutlierAccountScope) {
    const account = await this.inputs.authorize(scope);
    const computedAt = new Date();
    const observations = await this.inputs.read(account);
    const config = await this.configuration.resolve(account.organizationId);
    const where = { ...account, isDeleted: false };
    const previousTypes = await this.prisma.outlierBaselineSnapshot.groupBy({
      where: scopedWhere(account.organizationId, where),
      by: ['contentType'],
    });
    const previous: OutlierBaselineSnapshot[] = [];
    for (const { contentType } of previousTypes) {
      const latest = await this.prisma.outlierBaselineSnapshot.findFirst({
        where: scopedWhere(account.organizationId, { ...where, contentType }),
        orderBy: [{ computedAt: 'desc' }, { id: 'desc' }],
      });
      if (latest) previous.push(latest);
    }
    const buckets = new Set([
      ...observations.map((post) => post.contentType),
      ...previous.map((snapshot) => snapshot.contentType),
    ]);
    const snapshots: OutlierBaselineSnapshot[] = [];
    for (const contentType of [...buckets].sort()) {
      snapshots.push(
        await this.refreshBucket(
          account,
          contentType,
          observations,
          previous,
          config,
          computedAt,
        ),
      );
    }
    return snapshots;
  }
  private async refreshBucket(
    account: OutlierResolvedAccount,
    contentType: string,
    observations: OutlierObservation[],
    previous: OutlierBaselineSnapshot[],
    config: OutlierConfigurationValues,
    computedAt: Date,
  ): Promise<OutlierBaselineSnapshot> {
    const current = observations.filter(
      (post) => post.contentType === contentType,
    );
    const prior = previous.find(
      (snapshot) => snapshot.contentType === contentType,
    );
    const tracked = prior
      ? await this.prisma.outlierPostPerformance.findMany({
          where: {
            organizationId: account.organizationId,
            isDeleted: false,
            baselineSnapshotId: prior.id,
          },
          select: { logicalPostId: true },
          orderBy: { logicalPostId: 'asc' },
        })
      : [];
    const ids = new Set(current.map((post) => post.id));
    const deleted: OutlierObservation[] = tracked
      .filter((post) => !ids.has(post.logicalPostId))
      .map((post) => ({
        ...account,
        contentType,
        id: post.logicalPostId,
        publishedAtMs: NaN,
        views: null,
        isDeleted: true,
        isPinned: null,
        isPromoted: null,
        postId: null,
        sourcePostId: null,
        sourceIdentity: 'soft_deleted',
        measuredAt: computedAt,
      }));
    const posts = [...current, ...deleted].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const maturityMs =
      (config.maturityHoursByPlatform[
        account.platform as keyof typeof config.maturityHoursByPlatform
      ] ?? 48) * 3_600_000;
    const baseline = computeOutlierBaseline({
      scope: { ...account, contentType },
      nowMs: computedAt.getTime(),
      posts,
      options: {
        windowSize: config.windowSize,
        minimumSampleSize: config.minimumSampleSize,
        outlierThreshold: config.outlierThreshold,
        breakoutThreshold: config.breakoutThreshold,
        maturityMs,
      },
    });
    const inputFingerprint = hash({
      account,
      contentType,
      options: baseline.options,
      posts: posts.map((post, index) => ({
        id: post.id,
        sourceIdentity: post.sourceIdentity,
        postId: post.postId,
        sourcePostId: post.sourcePostId,
        publishedAtMs: Number.isFinite(post.publishedAtMs)
          ? post.publishedAtMs
          : null,
        views: post.views,
        isDeleted: post.isDeleted,
        isPinned: post.isPinned,
        isPromoted: post.isPromoted,
        reasons: baseline.posts[index].reasons,
      })),
    });
    if (prior?.inputFingerprint === inputFingerprint) {
      return prior;
    }
    const idempotencyKey = hash({
      previousId: prior?.id ?? 'initial',
      inputFingerprint,
    });
    const data: Prisma.OutlierBaselineSnapshotUncheckedCreateInput = {
      ...account,
      contentType,
      inputFingerprint,
      idempotencyKey,
      computedAt,
      medianViews: baseline.median,
      sampleSize: baseline.sampleSize,
      ...baseline.options,
      status: baseline.status,
      contributorIds: baseline.contributorIds,
      exclusions: baseline.posts.flatMap((post) =>
        post.reasons.map((reason) => ({ postId: post.id, reason })),
      ),
      unknownEligibility: baseline.posts
        .filter((post) => post.isPinnedUnknown || post.isPromotedUnknown)
        .map((post) => ({
          postId: post.id,
          isPinnedUnknown: post.isPinnedUnknown,
          isPromotedUnknown: post.isPromotedUnknown,
        })),
    };
    try {
      const snapshot = await this.persistBucket(
        account,
        contentType,
        posts,
        baseline,
        data,
      );
      return snapshot;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.outlierBaselineSnapshot.findFirst({
          where: {
            organizationId: account.organizationId,
            isDeleted: false,
            idempotencyKey,
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }
  private async persistBucket(
    account: OutlierResolvedAccount,
    contentType: string,
    posts: OutlierObservation[],
    baseline: ReturnType<typeof computeOutlierBaseline>,
    data: Prisma.OutlierBaselineSnapshotUncheckedCreateInput,
  ): Promise<OutlierBaselineSnapshot> {
    return this.prisma.$transaction(
      async (tx) => {
        const snapshot = await tx.outlierBaselineSnapshot.create({ data });
        if (posts.length)
          await tx.outlierPostPerformance.createMany({
            data: posts.map((post, index) => {
              const result = baseline.posts[index];
              return {
                ...account,
                contentType,
                baselineSnapshotId: snapshot.id,
                logicalPostId: post.id,
                postId: post.postId,
                sourcePostId: post.sourcePostId,
                measuredAt: post.measuredAt,
                publishedAt: Number.isFinite(post.publishedAtMs)
                  ? new Date(post.publishedAtMs)
                  : null,
                views: post.views,
                outlierRatio: result.ratio,
                outlierTier: result.tier,
                isContributor: result.isContributor,
                eligibility: result.reasons.length
                  ? 'excluded'
                  : result.isPinnedUnknown || result.isPromotedUnknown
                    ? 'unknown'
                    : 'eligible',
                exclusionReasons: result.reasons,
                isPinnedUnknown: result.isPinnedUnknown,
                isPromotedUnknown: result.isPromotedUnknown,
              };
            }),
          });
        return snapshot;
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }
  async findOne(organizationId: string, id: string) {
    const snapshot = await this.prisma.outlierBaselineSnapshot.findFirst({
      where: { id, organizationId, isDeleted: false },
    });
    if (
      !snapshot ||
      (snapshot.accountType !== 'credential' &&
        snapshot.accountType !== 'social_source')
    )
      throw new NotFoundException('Outlier baseline');
    await this.inputs.authorize({
      ...snapshot,
      accountType: snapshot.accountType,
    });
    return snapshot;
  }
  async list(scope: OutlierAccountScope, query: OutlierListQuery) {
    const account = await this.inputs.authorize(scope);
    const { page, limit } = this.pagination(query.page, query.limit);
    const where = {
      ...account,
      isDeleted: false,
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.contentType ? { contentType: query.contentType } : {}),
    };
    const [docs, total] = await Promise.all([
      this.prisma.outlierBaselineSnapshot.findMany({
        where: scopedWhere(account.organizationId, where),
        orderBy: [{ computedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.outlierBaselineSnapshot.count({
        where: scopedWhere(account.organizationId, where),
      }),
    ]);
    return {
      docs,
      totalDocs: total,
      totalPages: Math.ceil(total / limit),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }
  async listLatestPerformances(
    organizationId: string,
    query: OutlierRankedPostsQuery,
  ) {
    const { page, limit } = this.pagination(query.page, query.limit);
    if (query.accountId || query.accountType) {
      if (!query.brandId || !query.accountId || !query.accountType) {
        throw new BadRequestException(
          'Account filters require brandId, accountType, and accountId',
        );
      }
      await this.inputs.authorize({
        organizationId,
        brandId: query.brandId,
        accountType: query.accountType,
        accountId: query.accountId,
      });
    } else if (query.brandId) {
      const brand = await this.prisma.brand.findFirst({
        select: { id: true },
        where: {
          id: query.brandId,
          organizationId,
          isDeleted: false,
        },
      });
      if (!brand) throw new NotFoundException('Outlier account');
    }
    const snapshotWhere = {
      organizationId,
      isDeleted: false,
      status: 'ready',
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.accountType ? { accountType: query.accountType } : {}),
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.contentType ? { contentType: query.contentType } : {}),
      ...(query.windowSize ? { windowSize: query.windowSize } : {}),
    };
    const groups = await this.prisma.outlierBaselineSnapshot.groupBy({
      by: ['accountId', 'platform', 'contentType'],
      where: scopedWhere(organizationId, snapshotWhere),
    });
    const latestIds: string[] = [];
    for (const group of groups) {
      const latest = await this.prisma.outlierBaselineSnapshot.findFirst({
        where: scopedWhere(organizationId, {
          ...snapshotWhere,
          accountId: group.accountId,
          platform: group.platform,
          contentType: group.contentType,
        }),
        orderBy: [{ computedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (latest) latestIds.push(latest.id);
    }
    if (!latestIds.length) {
      return {
        docs: [],
        totalDocs: 0,
        totalPages: 0,
        total: 0,
        page,
        limit,
        pages: 0,
      };
    }
    const where = {
      organizationId,
      isDeleted: false,
      baselineSnapshotId: { in: latestIds },
      outlierRatio: { not: null },
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.tier
        ? query.tier === 'breakout'
          ? { outlierTier: 'breakout' }
          : { outlierTier: { in: ['outlier', 'breakout'] } }
        : {}),
    };
    const orderBy = query.platform
      ? ([
          { outlierRatio: { sort: 'desc', nulls: 'last' } },
          { id: 'asc' },
        ] as const)
      : ([
          { platform: 'asc' },
          { outlierRatio: { sort: 'desc', nulls: 'last' } },
          { id: 'asc' },
        ] as const);
    const [rows, total, snapshots] = await Promise.all([
      this.prisma.outlierPostPerformance.findMany({
        where,
        orderBy: [...orderBy],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.outlierPostPerformance.count({ where }),
      this.prisma.outlierBaselineSnapshot.findMany({
        where: {
          organizationId,
          isDeleted: false,
          id: { in: latestIds },
        },
        select: {
          id: true,
          medianViews: true,
          sampleSize: true,
          windowSize: true,
          status: true,
          computedAt: true,
        },
      }),
    ]);
    const snapshotById = new Map(
      snapshots.map((snapshot) => [snapshot.id, snapshot]),
    );
    const docs = rows.map((row) => {
      const snapshot = snapshotById.get(row.baselineSnapshotId);
      return {
        ...row,
        medianViews: snapshot?.medianViews ?? null,
        sampleSize: snapshot?.sampleSize,
        windowSize: snapshot?.windowSize,
        snapshotStatus: snapshot?.status,
        snapshotComputedAt: snapshot?.computedAt.toISOString(),
      };
    });
    return {
      docs,
      totalDocs: total,
      totalPages: Math.ceil(total / limit),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }
  async posts(
    organizationId: string,
    id: string,
    pageInput = 1,
    limitInput = 20,
  ) {
    const { page, limit } = this.pagination(pageInput, limitInput);
    await this.findOne(organizationId, id);
    const where = { organizationId, isDeleted: false, baselineSnapshotId: id };
    const [docs, total] = await Promise.all([
      this.prisma.outlierPostPerformance.findMany({
        where,
        orderBy: { logicalPostId: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.outlierPostPerformance.count({ where }),
    ]);
    return {
      docs,
      totalDocs: total,
      totalPages: Math.ceil(total / limit),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }
  private pagination(pageInput: unknown, limitInput: unknown) {
    const page = Number(pageInput ?? 1);
    const limit = Number(limitInput ?? 20);
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1
    )
      throw new BadRequestException('Invalid outlier pagination');
    return { page: Math.min(1_000_000, page), limit: Math.min(100, limit) };
  }
}
