import {
  CTA_PATTERN_CATEGORIES,
  HEADLINE_PATTERN_CATEGORIES,
  SPEND_BUCKETS,
} from '@api/collections/ad-performance/utils/ad-performance-benchmark.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PatternMetricRow = {
  category: string;
  sampleSize: number | bigint;
  sumConversionRate?: number | null;
  sumCtr: number | null;
  sumRoas?: number | null;
};

type SpendBucketMetricRow = {
  range: string;
  sampleSize: number | bigint;
  sumPerformanceScore: number | null;
  sumRoas: number | null;
};

type BenchmarkMetricRow = {
  avgKey: string;
  sampleSize: number | bigint;
  sumCpa: number | null;
  sumCpc: number | null;
  sumCtr: number | null;
  sumRoas: number | null;
};

@Injectable()
export class AdAggregationService {
  private readonly MIN_ORGS = 5;
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async computeTopHeadlines(industry?: string): Promise<{
    patterns: Array<{
      category: string;
      avgCtr: number;
      avgRoas: number;
      sampleSize: number;
    }>;
    sampleSize: number;
  }> {
    this.logger.log(`${this.constructorName}: Computing top headlines`);

    const rows = await this.prisma.$queryRaw<PatternMetricRow[]>(
      Prisma.sql`
        SELECT
          pattern.category AS "category",
          COUNT(*)::integer AS "sampleSize",
          COALESCE(SUM(COALESCE(ap."ctr", 0) * COALESCE(ap."dataConfidence", 1)), 0)::double precision AS "sumCtr",
          COALESCE(SUM(CASE WHEN COALESCE(ap."roas", 0) > 0 THEN ap."roas" * COALESCE(ap."dataConfidence", 1) ELSE 0 END), 0)::double precision AS "sumRoas"
        FROM "ad_performance" ap
        CROSS JOIN LATERAL unnest(ap."headlinePatternCategories") AS pattern(category)
        WHERE ap."isDeleted" = false
          AND ap."scope" = 'public'
          AND cardinality(ap."headlinePatternCategories") > 0
          AND ap."headlinePatternCategories" && ${Object.keys(HEADLINE_PATTERN_CATEGORIES)}::text[]
          ${this.industryClause(industry)}
        GROUP BY pattern.category
        HAVING COUNT(DISTINCT ap."organizationId") >= ${this.MIN_ORGS}
      `,
    );

    const rowsByCategory = new Map(rows.map((row) => [row.category, row]));
    let totalSampleSize = 0;
    const patterns = Object.keys(HEADLINE_PATTERN_CATEGORIES).map(
      (category) => {
        const row = rowsByCategory.get(category);
        if (!row) {
          return { avgCtr: 0, avgRoas: 0, category, sampleSize: 0 };
        }

        const sampleSize = this.toNumber(row.sampleSize);
        totalSampleSize += sampleSize;

        return {
          avgCtr: this.round4(this.toNumber(row.sumCtr) / sampleSize),
          avgRoas: this.round4(this.toNumber(row.sumRoas) / sampleSize),
          category,
          sampleSize,
        };
      },
    );

    return { patterns, sampleSize: totalSampleSize };
  }

  async computeBestCtas(industry?: string): Promise<{
    patterns: Array<{
      category: string;
      avgCtr: number;
      avgConversionRate: number;
      sampleSize: number;
    }>;
    sampleSize: number;
  }> {
    this.logger.log(`${this.constructorName}: Computing best CTAs`);

    const rows = await this.prisma.$queryRaw<PatternMetricRow[]>(
      Prisma.sql`
        SELECT
          pattern.category AS "category",
          COUNT(*)::integer AS "sampleSize",
          COALESCE(SUM(COALESCE(ap."ctr", 0)), 0)::double precision AS "sumCtr",
          COALESCE(SUM(CASE WHEN COALESCE(ap."conversionRate", 0) > 0 THEN ap."conversionRate" ELSE 0 END), 0)::double precision AS "sumConversionRate"
        FROM "ad_performance" ap
        CROSS JOIN LATERAL unnest(ap."ctaPatternCategories") AS pattern(category)
        WHERE ap."isDeleted" = false
          AND ap."scope" = 'public'
          AND cardinality(ap."ctaPatternCategories") > 0
          AND ap."ctaPatternCategories" && ${Object.keys(CTA_PATTERN_CATEGORIES)}::text[]
          ${this.industryClause(industry)}
        GROUP BY pattern.category
        HAVING COUNT(DISTINCT ap."organizationId") >= ${this.MIN_ORGS}
      `,
    );

    const rowsByCategory = new Map(rows.map((row) => [row.category, row]));
    let totalSampleSize = 0;
    const patterns = Object.keys(CTA_PATTERN_CATEGORIES).map((category) => {
      const row = rowsByCategory.get(category);
      if (!row) {
        return {
          avgConversionRate: 0,
          avgCtr: 0,
          category,
          sampleSize: 0,
        };
      }

      const sampleSize = this.toNumber(row.sampleSize);
      totalSampleSize += sampleSize;

      return {
        avgConversionRate: this.round4(
          this.toNumber(row.sumConversionRate) / sampleSize,
        ),
        avgCtr: this.round4(this.toNumber(row.sumCtr) / sampleSize),
        category,
        sampleSize,
      };
    });

    return { patterns, sampleSize: totalSampleSize };
  }

  async computeOptimalSpend(
    platform?: string,
    industry?: string,
  ): Promise<{
    buckets: Array<{
      range: string;
      avgPerformanceScore: number;
      avgRoas: number;
      sampleSize: number;
    }>;
    sampleSize: number;
  }> {
    this.logger.log(`${this.constructorName}: Computing optimal spend`);

    const rows = await this.prisma.$queryRaw<SpendBucketMetricRow[]>(
      Prisma.sql`
        SELECT
          ap."spendBucket" AS "range",
          COUNT(*)::integer AS "sampleSize",
          COALESCE(SUM(COALESCE(ap."performanceScore", 0)), 0)::double precision AS "sumPerformanceScore",
          COALESCE(SUM(CASE WHEN COALESCE(ap."roas", 0) > 0 THEN ap."roas" ELSE 0 END), 0)::double precision AS "sumRoas"
        FROM "ad_performance" ap
        WHERE ap."isDeleted" = false
          AND ap."scope" = 'public'
          AND ap."spendBucket" IS NOT NULL
          ${this.platformClause(platform)}
          ${this.industryClause(industry)}
        GROUP BY ap."spendBucket"
        HAVING COUNT(DISTINCT ap."organizationId") >= ${this.MIN_ORGS}
      `,
    );

    const rowsByRange = new Map(rows.map((row) => [row.range, row]));
    let totalSampleSize = 0;
    const buckets = SPEND_BUCKETS.flatMap((bucket) => {
      const row = rowsByRange.get(bucket.label);
      if (!row) return [];

      const sampleSize = this.toNumber(row.sampleSize);
      totalSampleSize += sampleSize;

      return [
        {
          avgPerformanceScore: this.round2(
            this.toNumber(row.sumPerformanceScore) / sampleSize,
          ),
          avgRoas: this.round2(this.toNumber(row.sumRoas) / sampleSize),
          range: bucket.label,
          sampleSize,
        },
      ];
    });

    return { buckets, sampleSize: totalSampleSize };
  }

  async computePlatformBenchmarks(industry?: string): Promise<{
    meta: {
      avgCtr: number;
      avgCpc: number;
      avgCpa: number;
      avgRoas: number;
      sampleSize: number;
    };
    google: {
      avgCtr: number;
      avgCpc: number;
      avgCpa: number;
      avgRoas: number;
      sampleSize: number;
    };
    tiktok: {
      avgCtr: number;
      avgCpc: number;
      avgCpa: number;
      avgRoas: number;
      sampleSize: number;
    };
    sampleSize: number;
  }> {
    this.logger.log(`${this.constructorName}: Computing platform benchmarks`);

    const rows = await this.prisma.$queryRaw<BenchmarkMetricRow[]>(
      Prisma.sql`
        SELECT
          COALESCE(ap."adPlatform", 'unknown') AS "avgKey",
          COUNT(*)::integer AS "sampleSize",
          COALESCE(SUM(COALESCE(ap."ctr", 0)), 0)::double precision AS "sumCtr",
          COALESCE(SUM(COALESCE(ap."cpc", 0)), 0)::double precision AS "sumCpc",
          COALESCE(SUM(CASE WHEN COALESCE(ap."cpa", 0) > 0 THEN ap."cpa" ELSE 0 END), 0)::double precision AS "sumCpa",
          COALESCE(SUM(CASE WHEN COALESCE(ap."roas", 0) > 0 THEN ap."roas" ELSE 0 END), 0)::double precision AS "sumRoas"
        FROM "ad_performance" ap
        WHERE ap."isDeleted" = false
          AND ap."scope" = 'public'
          ${this.industryClause(industry)}
        GROUP BY COALESCE(ap."adPlatform", 'unknown')
        HAVING COUNT(DISTINCT ap."organizationId") >= ${this.MIN_ORGS}
      `,
    );

    const benchmarkMap = new Map(
      rows.map((row) => [row.avgKey, this.toBenchmark(row)]),
    );

    return {
      google: benchmarkMap.get('google') ?? this.emptyBenchmark(),
      meta: benchmarkMap.get('meta') ?? this.emptyBenchmark(),
      sampleSize: rows.reduce(
        (sum, row) => sum + this.toNumber(row.sampleSize),
        0,
      ),
      tiktok: benchmarkMap.get('tiktok') ?? this.emptyBenchmark(),
    };
  }

  async computeIndustryBenchmarks(): Promise<{
    industries: Array<{
      industry: string;
      avgCtr: number;
      avgCpc: number;
      avgCpa: number;
      avgRoas: number;
      sampleSize: number;
    }>;
    sampleSize: number;
  }> {
    this.logger.log(`${this.constructorName}: Computing industry benchmarks`);

    const rows = await this.prisma.$queryRaw<BenchmarkMetricRow[]>(
      Prisma.sql`
        SELECT
          ap."industry" AS "avgKey",
          COUNT(*)::integer AS "sampleSize",
          COALESCE(SUM(COALESCE(ap."ctr", 0)), 0)::double precision AS "sumCtr",
          COALESCE(SUM(COALESCE(ap."cpc", 0)), 0)::double precision AS "sumCpc",
          COALESCE(SUM(CASE WHEN COALESCE(ap."cpa", 0) > 0 THEN ap."cpa" ELSE 0 END), 0)::double precision AS "sumCpa",
          COALESCE(SUM(CASE WHEN COALESCE(ap."roas", 0) > 0 THEN ap."roas" ELSE 0 END), 0)::double precision AS "sumRoas"
        FROM "ad_performance" ap
        WHERE ap."isDeleted" = false
          AND ap."scope" = 'public'
          AND ap."industry" IS NOT NULL
        GROUP BY ap."industry"
        HAVING COUNT(DISTINCT ap."organizationId") >= ${this.MIN_ORGS}
        ORDER BY "sampleSize" DESC
      `,
    );

    return {
      industries: rows.map((row) => ({
        ...this.toBenchmark(row),
        industry: row.avgKey,
      })),
      sampleSize: rows.reduce(
        (sum, row) => sum + this.toNumber(row.sampleSize),
        0,
      ),
    };
  }

  private industryClause(industry?: string) {
    return industry
      ? Prisma.sql`AND ap."industry" = ${industry}`
      : Prisma.empty;
  }

  private platformClause(platform?: string) {
    return platform
      ? Prisma.sql`AND ap."adPlatform" = ${platform}`
      : Prisma.empty;
  }

  private toBenchmark(row: BenchmarkMetricRow): {
    avgCtr: number;
    avgCpc: number;
    avgCpa: number;
    avgRoas: number;
    sampleSize: number;
  } {
    const sampleSize = this.toNumber(row.sampleSize);

    return {
      avgCpa: this.round4(this.toNumber(row.sumCpa) / sampleSize),
      avgCpc: this.round4(this.toNumber(row.sumCpc) / sampleSize),
      avgCtr: this.round4(this.toNumber(row.sumCtr) / sampleSize),
      avgRoas: this.round4(this.toNumber(row.sumRoas) / sampleSize),
      sampleSize,
    };
  }

  private emptyBenchmark(): {
    avgCtr: number;
    avgCpc: number;
    avgCpa: number;
    avgRoas: number;
    sampleSize: number;
  } {
    return {
      avgCpa: 0,
      avgCpc: 0,
      avgCtr: 0,
      avgRoas: 0,
      sampleSize: 0,
    };
  }

  private toNumber(value: number | bigint | string | null | undefined): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    return 0;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private round4(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}
