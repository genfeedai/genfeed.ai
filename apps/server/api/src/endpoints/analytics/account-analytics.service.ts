import {
  analyticsAccountPeriodSeriesSql,
  analyticsAccountTopPostsSql,
} from '@api/endpoints/analytics/analytics-period-sql';
import { assertAnalyticsBrandInScope } from '@api/endpoints/analytics/analytics-tenant-scope';
import type { AccountAnalyticsQueryDto } from '@api/endpoints/analytics/dto/account-analytics-query.dto';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  AnalyticsMetric,
  AnalyticsMetricAvailability,
  classifyAccountEvaluation,
  fromPrismaCredentialPlatform,
  isFleetEvaluationMetric,
  Platform,
  periodMetricGain,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IAccountAnalytics,
  IAccountAnalyticsDetail,
  IAccountAnalyticsList,
  IAccountAnalyticsSeriesPoint,
  IAccountMetricValue,
  IFleetEvaluationPolicy,
  ITopContent,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

type PeriodRow = {
  comments: number | null;
  credentialId: string;
  likes: number | null;
  posts: number;
  prevComments: number | null;
  prevLikes: number | null;
  prevSaves: number | null;
  prevShares: number | null;
  prevViews: number | null;
  saves: number | null;
  shares: number | null;
  views: number | null;
};

type SnapshotRow = {
  credentialId: string;
  date: Date;
  followers: number | null;
  subscribers: number | null;
};

type SeriesRow = {
  comments: number | null;
  day: string;
  likes: number | null;
  saves: number | null;
  shares: number | null;
  views: number | null;
};

type TopPostRow = {
  comments: number | null;
  description: string | null;
  engagement_rate: number | null;
  likes: number | null;
  platform: string | null;
  post_id: string;
  publish_date: Date | null;
  shares: number | null;
  title: string | null;
  url: string | null;
  views: number | null;
};

const DEFAULT_POLICY_VERSION = 1;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

@Injectable()
export class AccountAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  public async assertBrandInScope(
    brandId: string | undefined,
    organizationId: string | undefined,
  ): Promise<void> {
    await assertAnalyticsBrandInScope(
      async (where) => {
        // tenant-scope-ignore: assertAnalyticsBrandInScope always sets id and isDeleted
        return this.prisma.brand.findFirst({ select: { id: true }, where });
      },
      brandId,
      organizationId,
    );
  }

  public async listAccounts(
    organizationId: string,
    query: AccountAnalyticsQueryDto,
  ): Promise<IAccountAnalyticsList> {
    const accounts = await this.loadAccounts(organizationId, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const start = (page - 1) * limit;
    return {
      accounts: accounts.slice(start, start + limit),
      limit,
      page,
      total: accounts.length,
      totalPages: Math.max(1, Math.ceil(accounts.length / limit)),
      unattributedPostCount: await this.countUnattributed(
        organizationId,
        query.brandId,
      ),
    };
  }

  public async topAccounts(
    organizationId: string,
    query: AccountAnalyticsQueryDto,
  ): Promise<IAccountAnalytics[]> {
    const metric = query.metric ?? AnalyticsMetric.VIEWS;
    const accounts = (await this.loadAccounts(organizationId, query)).filter(
      (account) =>
        account.metrics.some(
          (item) =>
            item.metric === metric &&
            item.availability === AnalyticsMetricAvailability.OBSERVED &&
            item.change !== null,
        ),
    );
    return accounts.slice(0, query.limit ?? 5);
  }

  public async getAccount(
    organizationId: string,
    credentialId: string,
    query: AccountAnalyticsQueryDto,
  ): Promise<IAccountAnalyticsDetail | null> {
    const accounts = await this.loadAccounts(organizationId, {
      ...query,
      search: undefined,
    });
    const account = accounts.find(
      (item) => item.identity.credentialId === credentialId,
    );
    if (!account) {
      return null;
    }

    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      query.startDate,
      query.endDate,
    );
    const [series, topPosts] = await Promise.all([
      this.loadSeries(organizationId, credentialId, startDate, endDate),
      this.loadTopPosts(organizationId, credentialId, startDate, endDate),
    ]);

    return {
      ...account,
      growth: account.metrics.filter((metric) =>
        [AnalyticsMetric.FOLLOWERS, AnalyticsMetric.SUBSCRIBERS].includes(
          metric.metric,
        ),
      ),
      series,
      topPosts,
    };
  }

  public async getPolicy(
    organizationId: string,
    brandId?: string,
  ): Promise<IFleetEvaluationPolicy | null> {
    const settings = await this.prisma.organizationSetting.findFirst({
      select: { fleetEvaluationPolicy: true },
      where: { organizationId },
    });
    return this.readPolicy(settings?.fleetEvaluationPolicy, brandId);
  }

  public async savePolicy(
    organizationId: string,
    policy: IFleetEvaluationPolicy,
    brandId?: string,
  ): Promise<IFleetEvaluationPolicy> {
    if (policy.watchMin > policy.healthyMin) {
      throw new BadRequestException(
        'watchMin must be less than or equal to healthyMin',
      );
    }
    if (!isFleetEvaluationMetric(policy.metric)) {
      throw new BadRequestException('Unsupported fleet evaluation metric');
    }

    const existing = await this.prisma.organizationSetting.findFirst({
      where: { organizationId },
    });
    const current = this.readPolicy(existing?.fleetEvaluationPolicy) ?? {
      ...policy,
      version: DEFAULT_POLICY_VERSION,
    };
    const next: IFleetEvaluationPolicy = brandId
      ? {
          ...current,
          brandOverrides: {
            ...(current.brandOverrides ?? {}),
            [brandId]: policy,
          },
          version: current.version + 1,
        }
      : { ...policy, version: current.version + 1 };

    if (existing) {
      await this.prisma.organizationSetting.update({
        data: {
          fleetEvaluationPolicy: next as unknown as Prisma.InputJsonValue,
        },
        where: { id: existing.id },
      });
    } else {
      await this.prisma.organizationSetting.create({
        data: {
          fleetEvaluationPolicy: next as unknown as Prisma.InputJsonValue,
          organizationId,
        },
      });
    }

    return this.readPolicy(next, brandId) ?? next;
  }

  private async loadAccounts(
    organizationId: string,
    query: AccountAnalyticsQueryDto,
  ): Promise<IAccountAnalytics[]> {
    const { startDate, endDate } = DateRangeUtil.parseDateRange(
      query.startDate,
      query.endDate,
    );
    const credentials = await this.prisma.credential.findMany({
      select: {
        brand: { select: { label: true } },
        brandId: true,
        createdAt: true,
        externalAvatar: true,
        externalHandle: true,
        externalId: true,
        externalName: true,
        id: true,
        isConnected: true,
        label: true,
        platform: true,
      },
      where: scopedWhere(organizationId, {
        ...(query.brandId ? { brandId: query.brandId } : {}),
        ...(query.platform
          ? { platform: toPrismaCredentialPlatform(query.platform) }
          : {}),
        ...(query.status === 'connected' ? { isConnected: true } : {}),
        ...(query.status === 'disconnected' ? { isConnected: false } : {}),
        externalId: { not: null },
      }),
    });

    const credentialIds = credentials.map((row) => row.id);
    const [periodRows, startSnapshots, endSnapshots, firstPublished, policy] =
      await Promise.all([
        this.loadPeriodRows(organizationId, credentialIds, startDate, endDate),
        this.loadSnapshots(organizationId, credentialIds, startDate, 'start'),
        this.loadSnapshots(organizationId, credentialIds, endDate, 'end'),
        this.loadFirstPublished(organizationId, credentialIds),
        this.getPolicy(organizationId, query.brandId),
      ]);

    const periodByCredential = new Map(
      periodRows.map((row) => [row.credentialId, row]),
    );
    const startByCredential = new Map(
      startSnapshots.map((row) => [row.credentialId, row]),
    );
    const endByCredential = new Map(
      endSnapshots.map((row) => [row.credentialId, row]),
    );

    const search = query.search?.trim().toLowerCase();
    const metric = query.metric ?? AnalyticsMetric.VIEWS;
    const direction = query.direction === 'asc' ? 1 : -1;
    const now = Date.now();

    const accounts = credentials
      .map((credential) => {
        const identity = this.toIdentity(credential);
        if (
          search &&
          ![
            identity.label,
            identity.externalHandle,
            identity.externalName,
            identity.brandLabel,
          ]
            .join(' ')
            .toLowerCase()
            .includes(search)
        ) {
          return null;
        }

        const period = periodByCredential.get(credential.id);
        const metrics = this.metricsFor(
          period,
          startByCredential.get(credential.id),
          endByCredential.get(credential.id),
        );
        const publishedPosts = toFiniteNumber(period?.posts) ?? 0;
        const firstPublishedAt = firstPublished.get(credential.id) ?? null;
        const ageDays = firstPublishedAt
          ? Math.floor((now - firstPublishedAt.getTime()) / 86_400_000)
          : Math.floor((now - credential.createdAt.getTime()) / 86_400_000);
        const ranked = metrics.find((item) => item.metric === metric);
        const endSnapshot = endByCredential.get(credential.id);
        const freshnessHours = endSnapshot
          ? (now - endSnapshot.date.getTime()) / 3_600_000
          : null;
        const evaluation = classifyAccountEvaluation({
          accountAgeDays: ageDays,
          coverage: publishedPosts > 0 ? 1 : 0,
          freshnessHours,
          metricAvailability:
            ranked?.availability ?? AnalyticsMetricAvailability.UNAVAILABLE,
          metricValue: ranked?.change ?? ranked?.lifetime ?? null,
          policy,
          publishedPosts,
        });

        const account: IAccountAnalytics = {
          coverage: publishedPosts > 0 ? 1 : 0,
          evaluation,
          freshnessHours,
          identity: {
            ...identity,
            firstPublishedAt: firstPublishedAt?.toISOString() ?? null,
          },
          metrics,
          publishedPosts,
        };
        return account;
      })
      .filter((account): account is IAccountAnalytics => account !== null)
      .filter((account) =>
        query.evaluationState
          ? account.evaluation?.state === query.evaluationState
          : true,
      )
      .sort((left, right) => {
        const leftValue = this.sortValue(left, metric);
        const rightValue = this.sortValue(right, metric);
        if (leftValue === null && rightValue === null) {
          return left.identity.credentialId.localeCompare(
            right.identity.credentialId,
          );
        }
        if (leftValue === null) {
          return 1;
        }
        if (rightValue === null) {
          return -1;
        }
        if (leftValue === rightValue) {
          return left.identity.credentialId.localeCompare(
            right.identity.credentialId,
          );
        }
        return (leftValue - rightValue) * direction;
      });

    return accounts;
  }

  private sortValue(
    account: IAccountAnalytics,
    metric: AnalyticsMetric,
  ): number | null {
    const match = account.metrics.find((item) => item.metric === metric);
    if (!match || match.availability !== AnalyticsMetricAvailability.OBSERVED) {
      return null;
    }
    return match.change ?? match.lifetime;
  }

  private toIdentity(credential: {
    brand?: { label: string } | null;
    brandId: string | null;
    createdAt: Date;
    externalAvatar: string | null;
    externalHandle: string | null;
    externalId: string | null;
    externalName: string | null;
    id: string;
    isConnected: boolean;
    label: string | null;
    platform: string;
  }): IAccountAnalytics['identity'] {
    const platform =
      fromPrismaCredentialPlatform(
        credential.platform as Parameters<
          typeof fromPrismaCredentialPlatform
        >[0],
      ) ?? (credential.platform.toLowerCase() as Platform);

    return {
      brandId: credential.brandId ?? '',
      brandLabel: credential.brand?.label ?? '',
      connectedAt: credential.createdAt.toISOString(),
      credentialId: credential.id,
      externalAvatar: credential.externalAvatar,
      externalHandle: credential.externalHandle,
      externalId: credential.externalId,
      externalName: credential.externalName,
      firstPublishedAt: null,
      firstTrackedAt: credential.createdAt.toISOString(),
      isConnected: credential.isConnected,
      label: credential.label,
      manageHref: `${APP_ROUTES.SETTINGS.SOCIAL}?credential=${credential.id}`,
      platform,
    };
  }

  private metricsFor(
    period: PeriodRow | undefined,
    startSnapshot: SnapshotRow | undefined,
    endSnapshot: SnapshotRow | undefined,
  ): IAccountMetricValue[] {
    const views = periodMetricGain({
      endValue: toFiniteNumber(period?.views),
      startValue: toFiniteNumber(period?.prevViews),
    });
    const likes = periodMetricGain({
      endValue: toFiniteNumber(period?.likes),
      startValue: toFiniteNumber(period?.prevLikes),
    });
    const followers = periodMetricGain({
      endValue: toFiniteNumber(endSnapshot?.followers),
      startValue: toFiniteNumber(startSnapshot?.followers),
    });
    const subscribers = periodMetricGain({
      endValue: toFiniteNumber(endSnapshot?.subscribers),
      startValue: toFiniteNumber(startSnapshot?.subscribers),
    });

    return [
      this.toMetric(AnalyticsMetric.VIEWS, views),
      this.toMetric(AnalyticsMetric.LIKES, likes),
      this.toMetric(AnalyticsMetric.FOLLOWERS, followers),
      this.toMetric(AnalyticsMetric.SUBSCRIBERS, subscribers),
      {
        availability: AnalyticsMetricAvailability.OBSERVED,
        change: toFiniteNumber(period?.posts) ?? 0,
        lifetime: toFiniteNumber(period?.posts) ?? 0,
        metric: AnalyticsMetric.POSTS,
      },
    ];
  }

  private toMetric(
    metric: AnalyticsMetric,
    result: ReturnType<typeof periodMetricGain>,
  ): IAccountMetricValue {
    return {
      availability: result.availability,
      change: result.value,
      lifetime:
        result.availability === AnalyticsMetricAvailability.OBSERVED
          ? result.value
          : null,
      metric,
    };
  }

  private async loadPeriodRows(
    organizationId: string,
    credentialIds: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<PeriodRow[]> {
    if (credentialIds.length === 0) {
      return [];
    }

    return this.prisma.$queryRaw<PeriodRow[]>`
      WITH end_snap AS (
        SELECT DISTINCT ON (p."credentialId", pa."postId", pa."platform")
          p."credentialId" AS "credentialId",
          pa."postId",
          pa."platform",
          pa."totalViews" AS views,
          pa."totalLikes" AS likes,
          pa."totalComments" AS comments,
          pa."totalShares" AS shares,
          pa."totalSaves" AS saves
        FROM "post_analytics" pa
        INNER JOIN "posts" p ON p.id = pa."postId"
        WHERE pa."organizationId" = ${organizationId}
          AND p."isDeleted" = false
          AND p."credentialId" IN (${Prisma.join(credentialIds)})
          AND pa."date" <= ${endDate}
        ORDER BY p."credentialId", pa."postId", pa."platform", pa."date" DESC
      ),
      start_snap AS (
        SELECT DISTINCT ON (p."credentialId", pa."postId", pa."platform")
          p."credentialId" AS "credentialId",
          pa."postId",
          pa."platform",
          pa."totalViews" AS views,
          pa."totalLikes" AS likes,
          pa."totalComments" AS comments,
          pa."totalShares" AS shares,
          pa."totalSaves" AS saves
        FROM "post_analytics" pa
        INNER JOIN "posts" p ON p.id = pa."postId"
        WHERE pa."organizationId" = ${organizationId}
          AND p."isDeleted" = false
          AND p."credentialId" IN (${Prisma.join(credentialIds)})
          AND pa."date" < ${startDate}
        ORDER BY p."credentialId", pa."postId", pa."platform", pa."date" DESC
      )
      SELECT
        e."credentialId",
        COUNT(DISTINCT e."postId") AS posts,
        SUM(e.views) AS views,
        SUM(s.views) AS "prevViews",
        SUM(e.likes) AS likes,
        SUM(s.likes) AS "prevLikes",
        SUM(e.comments) AS comments,
        SUM(s.comments) AS "prevComments",
        SUM(e.shares) AS shares,
        SUM(s.shares) AS "prevShares",
        SUM(e.saves) AS saves,
        SUM(s.saves) AS "prevSaves"
      FROM end_snap e
      LEFT JOIN start_snap s
        ON s."credentialId" = e."credentialId"
        AND s."postId" = e."postId"
        AND s."platform" = e."platform"
      GROUP BY e."credentialId"
    `;
  }

  private async loadSnapshots(
    organizationId: string,
    credentialIds: string[],
    boundary: Date,
    side: 'start' | 'end',
  ): Promise<SnapshotRow[]> {
    if (credentialIds.length === 0) {
      return [];
    }

    return this.prisma.$queryRaw<SnapshotRow[]>`
      SELECT DISTINCT ON ("credentialId")
        "credentialId",
        "date",
        followers,
        subscribers
      FROM "account_analytics_snapshots"
      WHERE "organizationId" = ${organizationId}
        AND "isDeleted" = false
        AND "credentialId" IN (${Prisma.join(credentialIds)})
        AND "date" ${side === 'start' ? Prisma.sql`< ${boundary}` : Prisma.sql`<= ${boundary}`}
      ORDER BY "credentialId", "date" DESC
    `;
  }

  private async loadSeries(
    organizationId: string,
    credentialId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<IAccountAnalyticsSeriesPoint[]> {
    const rows = await this.prisma.$queryRaw<SeriesRow[]>(
      analyticsAccountPeriodSeriesSql({
        credentialId,
        endDate,
        organizationId,
        startDate,
      }),
    );

    return rows.map((row) => {
      const views = periodMetricGain({
        endValue: toFiniteNumber(row.views),
        startValue: null,
      });
      const likes = periodMetricGain({
        endValue: toFiniteNumber(row.likes),
        startValue: null,
      });
      const comments = toFiniteNumber(row.comments);
      return {
        date: row.day,
        metrics: [
          this.toMetric(AnalyticsMetric.VIEWS, views),
          this.toMetric(AnalyticsMetric.LIKES, likes),
          {
            availability:
              comments === null
                ? AnalyticsMetricAvailability.UNAVAILABLE
                : AnalyticsMetricAvailability.OBSERVED,
            change: comments,
            lifetime: comments,
            metric: AnalyticsMetric.COMMENTS,
          },
        ],
      };
    });
  }

  private async loadTopPosts(
    organizationId: string,
    credentialId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ITopContent[]> {
    const rows = await this.prisma.$queryRaw<TopPostRow[]>(
      analyticsAccountTopPostsSql({
        credentialId,
        endDate,
        limit: 10,
        organizationId,
        startDate,
      }),
    );

    return rows.map((row) => ({
      comments: toFiniteNumber(row.comments) ?? 0,
      description: row.description ?? '',
      engagementRate: toFiniteNumber(row.engagement_rate) ?? 0,
      ingredientId: row.post_id,
      likes: toFiniteNumber(row.likes) ?? 0,
      platform: row.platform ?? '',
      postId: row.post_id,
      publishDate: row.publish_date ?? endDate,
      shares: toFiniteNumber(row.shares) ?? 0,
      title: row.title ?? '',
      url: row.url ?? undefined,
      views: toFiniteNumber(row.views) ?? 0,
    }));
  }

  private async loadFirstPublished(
    organizationId: string,
    credentialIds: string[],
  ): Promise<Map<string, Date>> {
    if (credentialIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.post.groupBy({
      by: ['credentialId'],
      _min: { publishedAt: true },
      where: scopedWhere(organizationId, {
        credentialId: { in: credentialIds },
        publishedAt: { not: null },
      }),
    });
    return new Map(
      rows.flatMap((row) =>
        row.credentialId && row._min.publishedAt
          ? [[row.credentialId, row._min.publishedAt] as const]
          : [],
      ),
    );
  }

  private async countUnattributed(
    organizationId: string,
    brandId?: string,
  ): Promise<number> {
    return this.prisma.post.count({
      where: scopedWhere(organizationId, {
        ...(brandId ? { brandId } : {}),
        credentialId: null,
        publishedAt: { not: null },
      }),
    });
  }

  private readPolicy(
    value: unknown,
    brandId?: string,
  ): IFleetEvaluationPolicy | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as IFleetEvaluationPolicy;
    if (typeof record.isEnabled !== 'boolean') {
      return null;
    }
    if (brandId && record.brandOverrides?.[brandId]) {
      return {
        ...record,
        ...record.brandOverrides[brandId],
      };
    }
    return record;
  }
}
