import {
  AdPerformance,
  type AdPerformanceDocument,
} from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class AdAggregationService {
  private readonly MIN_ORGS = 5;
  private readonly constructorName = String(this.constructor.name);

  constructor(
    @InjectModel(AdPerformance.name, DB_CONNECTIONS.CLOUD)
    private readonly adPerformanceModel: Model<AdPerformanceDocument>,
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

    const patternCategories: Record<string, RegExp> = {
      'benefit-focused': /\b(get|save|earn|boost|improve|increase)\b/i,
      comparison: /\b(vs\.?|versus|compared|better than|unlike)\b/i,
      'curiosity-gap': /\b(secret|surprising|you won't believe|revealed)\b/i,
      'how-to': /^how\s+to\b/i,
      'number-driven': /\b\d+\b/,
      'question-based': /\?$/,
      testimonial: /\b(review|rated|trusted|customers say)\b/i,
      urgency:
        /\b(limited|now|today|hurry|last chance|don't miss|ends|expires)\b/i,
    };

    const matchFilter: Record<string, unknown> = {
      headlineText: { $exists: true, $ne: null },
      isDeleted: false,
      scope: 'public',
    };

    if (industry) {
      matchFilter.industry = industry;
    }

    const patterns: Array<{
      category: string;
      avgCtr: number;
      avgRoas: number;
      sampleSize: number;
    }> = [];

    let totalSampleSize = 0;

    for (const [category, regex] of Object.entries(patternCategories)) {
      const pipeline = [
        {
          $match: {
            ...matchFilter,
            headlineText: { $regex: regex },
          },
        },
        {
          $group: {
            _id: null,
            avgCtr: {
              $avg: {
                $multiply: ['$ctr', '$dataConfidence'],
              },
            },
            avgRoas: {
              $avg: {
                $cond: [
                  { $gt: ['$roas', 0] },
                  { $multiply: ['$roas', '$dataConfidence'] },
                  0,
                ],
              },
            },
            distinctOrgs: { $addToSet: '$organization' },
            sampleSize: { $sum: 1 },
          },
        },
        {
          $match: {
            $expr: { $gte: [{ $size: '$distinctOrgs' }, this.MIN_ORGS] },
          },
        },
        {
          $project: {
            _id: 0,
            avgCtr: { $round: ['$avgCtr', 4] },
            avgRoas: { $round: ['$avgRoas', 4] },
            sampleSize: 1,
          },
        },
      ];

      try {
        const result = await this.adPerformanceModel.aggregate(pipeline);
        const row = result[0];
        patterns.push({
          avgCtr: row?.avgCtr || 0,
          avgRoas: row?.avgRoas || 0,
          category,
          sampleSize: row?.sampleSize || 0,
        });
        totalSampleSize += row?.sampleSize || 0;
      } catch (error: unknown) {
        this.logger.error(
          `${this.constructorName}: Failed to compute pattern ${category}`,
          error,
        );
        patterns.push({ avgCtr: 0, avgRoas: 0, category, sampleSize: 0 });
      }
    }

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

    const ctaMapping: Record<string, RegExp> = {
      'book-now': /\b(book|reserve|schedule)\b/i,
      'contact-us': /\b(contact|call|reach out|get in touch)\b/i,
      download: /\b(download|install|get the app)\b/i,
      'get-started': /\b(get started|start|begin|try)\b/i,
      'learn-more': /\b(learn more|find out|discover|explore)\b/i,
      'shop-now': /\b(shop|buy|order|purchase)\b/i,
      'sign-up': /\b(sign up|register|join|subscribe|create account)\b/i,
      'try-free': /\b(free trial|try free|start free|no cost)\b/i,
    };

    const matchFilter: Record<string, unknown> = {
      ctaText: { $exists: true, $ne: null },
      isDeleted: false,
      scope: 'public',
    };

    if (industry) {
      matchFilter.industry = industry;
    }

    const patterns: Array<{
      category: string;
      avgCtr: number;
      avgConversionRate: number;
      sampleSize: number;
    }> = [];

    let totalSampleSize = 0;

    for (const [category, regex] of Object.entries(ctaMapping)) {
      const pipeline = [
        {
          $match: {
            ...matchFilter,
            ctaText: { $regex: regex },
          },
        },
        {
          $group: {
            _id: null,
            avgConversionRate: {
              $avg: {
                $cond: [{ $gt: ['$conversionRate', 0] }, '$conversionRate', 0],
              },
            },
            avgCtr: { $avg: '$ctr' },
            distinctOrgs: { $addToSet: '$organization' },
            sampleSize: { $sum: 1 },
          },
        },
        {
          $match: {
            $expr: { $gte: [{ $size: '$distinctOrgs' }, this.MIN_ORGS] },
          },
        },
        {
          $project: {
            _id: 0,
            avgConversionRate: { $round: ['$avgConversionRate', 4] },
            avgCtr: { $round: ['$avgCtr', 4] },
            sampleSize: 1,
          },
        },
      ];

      try {
        const result = await this.adPerformanceModel.aggregate(pipeline);
        const row = result[0];
        patterns.push({
          avgConversionRate: row?.avgConversionRate || 0,
          avgCtr: row?.avgCtr || 0,
          category,
          sampleSize: row?.sampleSize || 0,
        });
        totalSampleSize += row?.sampleSize || 0;
      } catch (error: unknown) {
        this.logger.error(
          `${this.constructorName}: Failed to compute CTA ${category}`,
          error,
        );
        patterns.push({
          avgConversionRate: 0,
          avgCtr: 0,
          category,
          sampleSize: 0,
        });
      }
    }

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

    const matchFilter: Record<string, unknown> = {
      isDeleted: false,
      scope: 'public',
      spend: { $gt: 0 },
    };

    if (platform) {
      matchFilter.adPlatform = platform;
    }
    if (industry) {
      matchFilter.industry = industry;
    }

    const pipeline = [
      { $match: matchFilter },
      {
        $bucket: {
          boundaries: [0, 50, 200, 500, 1000, Infinity],
          default: 'overflow',
          groupBy: '$spend',
          output: {
            avgPerformanceScore: { $avg: '$performanceScore' },
            avgRoas: {
              $avg: {
                $cond: [{ $gt: ['$roas', 0] }, '$roas', 0],
              },
            },
            distinctOrgs: { $addToSet: '$organization' },
            sampleSize: { $sum: 1 },
          },
        },
      },
      {
        $match: {
          $expr: { $gte: [{ $size: '$distinctOrgs' }, this.MIN_ORGS] },
        },
      },
    ];

    try {
      const results = await this.adPerformanceModel.aggregate(pipeline);

      const rangeLabels: Record<string, string> = {
        '0': '$0-50/day',
        '50': '$50-200/day',
        '200': '$200-500/day',
        '500': '$500-1000/day',
        '1000': '$1000+/day',
        overflow: '$1000+/day',
      };

      const buckets = results.map(
        (r: {
          _id: number | string;
          avgPerformanceScore: number;
          avgRoas: number;
          sampleSize: number;
        }) => ({
          avgPerformanceScore: Math.round(r.avgPerformanceScore * 100) / 100,
          avgRoas: Math.round(r.avgRoas * 100) / 100,
          range: rangeLabels[String(r._id)] || `$${r._id}+/day`,
          sampleSize: r.sampleSize,
        }),
      );

      const totalSampleSize = buckets.reduce(
        (sum: number, b: { sampleSize: number }) => sum + b.sampleSize,
        0,
      );

      return { buckets, sampleSize: totalSampleSize };
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName}: Failed to compute optimal spend`,
        error,
      );
      return { buckets: [], sampleSize: 0 };
    }
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

    const matchFilter: Record<string, unknown> = {
      isDeleted: false,
      scope: 'public',
    };

    if (industry) {
      matchFilter.industry = industry;
    }

    const pipeline = [
      { $match: matchFilter },
      {
        $group: {
          _id: '$adPlatform',
          avgCpa: {
            $avg: {
              $cond: [{ $gt: ['$cpa', 0] }, '$cpa', 0],
            },
          },
          avgCpc: { $avg: '$cpc' },
          avgCtr: { $avg: '$ctr' },
          avgRoas: {
            $avg: {
              $cond: [{ $gt: ['$roas', 0] }, '$roas', 0],
            },
          },
          distinctOrgs: { $addToSet: '$organization' },
          sampleSize: { $sum: 1 },
        },
      },
      {
        $match: {
          $expr: { $gte: [{ $size: '$distinctOrgs' }, this.MIN_ORGS] },
        },
      },
      {
        $project: {
          _id: 1,
          avgCpa: { $round: ['$avgCpa', 4] },
          avgCpc: { $round: ['$avgCpc', 4] },
          avgCtr: { $round: ['$avgCtr', 4] },
          avgRoas: { $round: ['$avgRoas', 4] },
          sampleSize: 1,
        },
      },
    ];

    const emptyBenchmark = {
      avgCpa: 0,
      avgCpc: 0,
      avgCtr: 0,
      avgRoas: 0,
      sampleSize: 0,
    };

    try {
      const results = await this.adPerformanceModel.aggregate(pipeline);

      const benchmarkMap: Record<
        string,
        {
          avgCtr: number;
          avgCpc: number;
          avgCpa: number;
          avgRoas: number;
          sampleSize: number;
        }
      > = {};

      for (const row of results) {
        benchmarkMap[row._id] = {
          avgCpa: row.avgCpa,
          avgCpc: row.avgCpc,
          avgCtr: row.avgCtr,
          avgRoas: row.avgRoas,
          sampleSize: row.sampleSize,
        };
      }

      const totalSampleSize = results.reduce(
        (sum: number, r: { sampleSize: number }) => sum + r.sampleSize,
        0,
      );

      return {
        google: benchmarkMap.google || { ...emptyBenchmark },
        meta: benchmarkMap.meta || { ...emptyBenchmark },
        sampleSize: totalSampleSize,
        tiktok: benchmarkMap.tiktok || { ...emptyBenchmark },
      };
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName}: Failed to compute platform benchmarks`,
        error,
      );
      return {
        google: { ...emptyBenchmark },
        meta: { ...emptyBenchmark },
        sampleSize: 0,
        tiktok: { ...emptyBenchmark },
      };
    }
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

    const pipeline = [
      {
        $match: {
          industry: { $exists: true, $ne: null },
          isDeleted: false,
          scope: 'public',
        },
      },
      {
        $group: {
          _id: '$industry',
          avgCpa: {
            $avg: {
              $cond: [{ $gt: ['$cpa', 0] }, '$cpa', 0],
            },
          },
          avgCpc: { $avg: '$cpc' },
          avgCtr: { $avg: '$ctr' },
          avgRoas: {
            $avg: {
              $cond: [{ $gt: ['$roas', 0] }, '$roas', 0],
            },
          },
          distinctOrgs: { $addToSet: '$organization' },
          sampleSize: { $sum: 1 },
        },
      },
      {
        $match: {
          $expr: { $gte: [{ $size: '$distinctOrgs' }, this.MIN_ORGS] },
        },
      },
      {
        $project: {
          _id: 1,
          avgCpa: { $round: ['$avgCpa', 4] },
          avgCpc: { $round: ['$avgCpc', 4] },
          avgCtr: { $round: ['$avgCtr', 4] },
          avgRoas: { $round: ['$avgRoas', 4] },
          sampleSize: 1,
        },
      },
      { $sort: { sampleSize: -1 as const } },
    ];

    try {
      const results = await this.adPerformanceModel.aggregate(pipeline);

      const industries = results.map(
        (r: {
          _id: string;
          avgCtr: number;
          avgCpc: number;
          avgCpa: number;
          avgRoas: number;
          sampleSize: number;
        }) => ({
          avgCpa: r.avgCpa,
          avgCpc: r.avgCpc,
          avgCtr: r.avgCtr,
          avgRoas: r.avgRoas,
          industry: r._id,
          sampleSize: r.sampleSize,
        }),
      );

      const totalSampleSize = industries.reduce(
        (sum: number, i: { sampleSize: number }) => sum + i.sampleSize,
        0,
      );

      return { industries, sampleSize: totalSampleSize };
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName}: Failed to compute industry benchmarks`,
        error,
      );
      return { industries: [], sampleSize: 0 };
    }
  }
}
