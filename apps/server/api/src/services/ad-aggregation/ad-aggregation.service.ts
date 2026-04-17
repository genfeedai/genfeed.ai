import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type AdPerformanceData = {
  headlineText?: string;
  ctaText?: string;
  ctr?: number;
  roas?: number;
  cpc?: number;
  cpa?: number;
  spend?: number;
  performanceScore?: number;
  adPlatform?: string;
  industry?: string;
  scope?: string;
  conversionRate?: number;
  dataConfidence?: number;
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

    const records = await this.prisma.adPerformance.findMany({
      select: { data: true, organizationId: true },
      where: { isDeleted: false },
    });

    // Filter to public scope + optional industry
    const eligible = records.filter((r) => {
      const d = (r.data ?? {}) as AdPerformanceData;
      if (d.scope !== 'public') return false;
      if (!d.headlineText) return false;
      if (industry && d.industry !== industry) return false;
      return true;
    });

    const patterns: Array<{
      category: string;
      avgCtr: number;
      avgRoas: number;
      sampleSize: number;
    }> = [];
    let totalSampleSize = 0;

    for (const [category, regex] of Object.entries(patternCategories)) {
      const matched = eligible.filter((r) => {
        const d = (r.data ?? {}) as AdPerformanceData;
        return regex.test(d.headlineText ?? '');
      });

      const distinctOrgs = new Set(matched.map((r) => r.organizationId));
      if (distinctOrgs.size < this.MIN_ORGS) {
        patterns.push({ avgCtr: 0, avgRoas: 0, category, sampleSize: 0 });
        continue;
      }

      const sumCtr = matched.reduce((sum, r) => {
        const d = (r.data ?? {}) as AdPerformanceData;
        return sum + (d.ctr ?? 0) * (d.dataConfidence ?? 1);
      }, 0);
      const sumRoas = matched.reduce((sum, r) => {
        const d = (r.data ?? {}) as AdPerformanceData;
        const roas = d.roas ?? 0;
        return sum + (roas > 0 ? roas * (d.dataConfidence ?? 1) : 0);
      }, 0);

      const count = matched.length;
      patterns.push({
        avgCtr: Math.round((sumCtr / count) * 10000) / 10000,
        avgRoas: Math.round((sumRoas / count) * 10000) / 10000,
        category,
        sampleSize: count,
      });
      totalSampleSize += count;
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

    const records = await this.prisma.adPerformance.findMany({
      select: { data: true, organizationId: true },
      where: { isDeleted: false },
    });

    const eligible = records.filter((r) => {
      const d = (r.data ?? {}) as AdPerformanceData;
      if (d.scope !== 'public') return false;
      if (!d.ctaText) return false;
      if (industry && d.industry !== industry) return false;
      return true;
    });

    const patterns: Array<{
      category: string;
      avgCtr: number;
      avgConversionRate: number;
      sampleSize: number;
    }> = [];
    let totalSampleSize = 0;

    for (const [category, regex] of Object.entries(ctaMapping)) {
      const matched = eligible.filter((r) => {
        const d = (r.data ?? {}) as AdPerformanceData;
        return regex.test(d.ctaText ?? '');
      });

      const distinctOrgs = new Set(matched.map((r) => r.organizationId));
      if (distinctOrgs.size < this.MIN_ORGS) {
        patterns.push({
          avgConversionRate: 0,
          avgCtr: 0,
          category,
          sampleSize: 0,
        });
        continue;
      }

      const sumCtr = matched.reduce((sum, r) => {
        const d = (r.data ?? {}) as AdPerformanceData;
        return sum + (d.ctr ?? 0);
      }, 0);
      const sumConvRate = matched.reduce((sum, r) => {
        const d = (r.data ?? {}) as AdPerformanceData;
        const cr = d.conversionRate ?? 0;
        return sum + (cr > 0 ? cr : 0);
      }, 0);

      const count = matched.length;
      patterns.push({
        avgConversionRate: Math.round((sumConvRate / count) * 10000) / 10000,
        avgCtr: Math.round((sumCtr / count) * 10000) / 10000,
        category,
        sampleSize: count,
      });
      totalSampleSize += count;
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

    const records = await this.prisma.adPerformance.findMany({
      select: { data: true, organizationId: true },
      where: { isDeleted: false },
    });

    const eligible = records.filter((r) => {
      const d = (r.data ?? {}) as AdPerformanceData;
      if (d.scope !== 'public') return false;
      if ((d.spend ?? 0) <= 0) return false;
      if (platform && d.adPlatform !== platform) return false;
      if (industry && d.industry !== industry) return false;
      return true;
    });

    const spendBoundaries = [
      { label: '$0-50/day', min: 0, max: 50 },
      { label: '$50-200/day', min: 50, max: 200 },
      { label: '$200-500/day', min: 200, max: 500 },
      { label: '$500-1000/day', min: 500, max: 1000 },
      { label: '$1000+/day', min: 1000, max: Infinity },
    ];

    const buckets: Array<{
      range: string;
      avgPerformanceScore: number;
      avgRoas: number;
      sampleSize: number;
    }> = [];

    let totalSampleSize = 0;

    for (const { label, min, max } of spendBoundaries) {
      const matched = eligible.filter((r) => {
        const d = (r.data ?? {}) as AdPerformanceData;
        const s = d.spend ?? 0;
        return s >= min && s < max;
      });

      const distinctOrgs = new Set(matched.map((r) => r.organizationId));
      if (distinctOrgs.size < this.MIN_ORGS) continue;

      const sumPerf = matched.reduce((sum, r) => {
        const d = (r.data ?? {}) as AdPerformanceData;
        return sum + (d.performanceScore ?? 0);
      }, 0);
      const sumRoas = matched.reduce((sum, r) => {
        const d = (r.data ?? {}) as AdPerformanceData;
        const roas = d.roas ?? 0;
        return sum + (roas > 0 ? roas : 0);
      }, 0);

      const count = matched.length;
      buckets.push({
        avgPerformanceScore: Math.round((sumPerf / count) * 100) / 100,
        avgRoas: Math.round((sumRoas / count) * 100) / 100,
        range: label,
        sampleSize: count,
      });
      totalSampleSize += count;
    }

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

    const records = await this.prisma.adPerformance.findMany({
      select: { data: true, organizationId: true },
      where: { isDeleted: false },
    });

    const eligible = records.filter((r) => {
      const d = (r.data ?? {}) as AdPerformanceData;
      if (d.scope !== 'public') return false;
      if (industry && d.industry !== industry) return false;
      return true;
    });

    const emptyBenchmark = {
      avgCpa: 0,
      avgCpc: 0,
      avgCtr: 0,
      avgRoas: 0,
      sampleSize: 0,
    };

    const platformGroups: Record<
      string,
      { data: AdPerformanceData; orgId: string }[]
    > = {};
    for (const r of eligible) {
      const d = (r.data ?? {}) as AdPerformanceData;
      const p = d.adPlatform ?? 'unknown';
      if (!platformGroups[p]) platformGroups[p] = [];
      platformGroups[p].push({ data: d, orgId: r.organizationId });
    }

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
    let totalSampleSize = 0;

    for (const [platform, rows] of Object.entries(platformGroups)) {
      const distinctOrgs = new Set(rows.map((r) => r.orgId));
      if (distinctOrgs.size < this.MIN_ORGS) continue;

      const count = rows.length;
      const sumCtr = rows.reduce((s, r) => s + (r.data.ctr ?? 0), 0);
      const sumCpc = rows.reduce((s, r) => s + (r.data.cpc ?? 0), 0);
      const sumCpa = rows.reduce(
        (s, r) => s + ((r.data.cpa ?? 0) > 0 ? (r.data.cpa ?? 0) : 0),
        0,
      );
      const sumRoas = rows.reduce(
        (s, r) => s + ((r.data.roas ?? 0) > 0 ? (r.data.roas ?? 0) : 0),
        0,
      );

      benchmarkMap[platform] = {
        avgCpa: Math.round((sumCpa / count) * 10000) / 10000,
        avgCpc: Math.round((sumCpc / count) * 10000) / 10000,
        avgCtr: Math.round((sumCtr / count) * 10000) / 10000,
        avgRoas: Math.round((sumRoas / count) * 10000) / 10000,
        sampleSize: count,
      };
      totalSampleSize += count;
    }

    return {
      google: benchmarkMap.google ?? { ...emptyBenchmark },
      meta: benchmarkMap.meta ?? { ...emptyBenchmark },
      sampleSize: totalSampleSize,
      tiktok: benchmarkMap.tiktok ?? { ...emptyBenchmark },
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

    const records = await this.prisma.adPerformance.findMany({
      select: { data: true, organizationId: true },
      where: { isDeleted: false },
    });

    const eligible = records.filter((r) => {
      const d = (r.data ?? {}) as AdPerformanceData;
      return d.scope === 'public' && Boolean(d.industry);
    });

    const industryGroups: Record<
      string,
      { data: AdPerformanceData; orgId: string }[]
    > = {};
    for (const r of eligible) {
      const d = (r.data ?? {}) as AdPerformanceData;
      const ind = d.industry!;
      if (!industryGroups[ind]) industryGroups[ind] = [];
      industryGroups[ind].push({ data: d, orgId: r.organizationId });
    }

    const industries: Array<{
      industry: string;
      avgCtr: number;
      avgCpc: number;
      avgCpa: number;
      avgRoas: number;
      sampleSize: number;
    }> = [];
    let totalSampleSize = 0;

    for (const [industry, rows] of Object.entries(industryGroups)) {
      const distinctOrgs = new Set(rows.map((r) => r.orgId));
      if (distinctOrgs.size < this.MIN_ORGS) continue;

      const count = rows.length;
      const sumCtr = rows.reduce((s, r) => s + (r.data.ctr ?? 0), 0);
      const sumCpc = rows.reduce((s, r) => s + (r.data.cpc ?? 0), 0);
      const sumCpa = rows.reduce(
        (s, r) => s + ((r.data.cpa ?? 0) > 0 ? (r.data.cpa ?? 0) : 0),
        0,
      );
      const sumRoas = rows.reduce(
        (s, r) => s + ((r.data.roas ?? 0) > 0 ? (r.data.roas ?? 0) : 0),
        0,
      );

      industries.push({
        avgCpa: Math.round((sumCpa / count) * 10000) / 10000,
        avgCpc: Math.round((sumCpc / count) * 10000) / 10000,
        avgCtr: Math.round((sumCtr / count) * 10000) / 10000,
        avgRoas: Math.round((sumRoas / count) * 10000) / 10000,
        industry,
        sampleSize: count,
      });
      totalSampleSize += count;
    }

    industries.sort((a, b) => b.sampleSize - a.sampleSize);

    return { industries, sampleSize: totalSampleSize };
  }
}
