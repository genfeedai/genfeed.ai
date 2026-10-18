import type { ContentPerformanceDocument } from '@api/collections/content-performance/schemas/content-performance.schema';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

export interface OptimizationCycleOptions {
  cycleNumber?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  topN?: number;
}

export interface PatternInsight {
  pattern: string;
  frequency: number;
  avgEngagementRate: number;
  avgPerformanceScore: number;
}

export interface TopPatterns {
  hooks: PatternInsight[];
  postingTimes: { hour: number; avgEngagementRate: number; count: number }[];
  platforms: { platform: string; avgEngagementRate: number; count: number }[];
  contentTypes: {
    contentType: string;
    avgEngagementRate: number;
    count: number;
  }[];
  sentimentStyles: PatternInsight[];
}

export interface OptimizationRecommendation {
  category: 'hook' | 'timing' | 'platform' | 'contentType' | 'style';
  recommendation: string;
  confidence: number;
  basedOn: number; // number of data points
}

export interface CycleStats {
  totalContent: number;
  avgEngagementRate: number;
  avgPerformanceScore: number;
  topEngagementRate: number;
  bottomEngagementRate: number;
  cycleNumber: number;
  dateRange: { start: string; end: string };
}

export interface GenerationSuggestion {
  prompt: string;
  suggestedHook: string;
  suggestedPlatform: string;
  suggestedPostTime: string;
  confidence: number;
}

export interface OptimizationCycleResult {
  topPatterns: TopPatterns;
  recommendations: OptimizationRecommendation[];
  nextBatchSuggestions: GenerationSuggestion[];
  cycleStats: CycleStats;
}

export interface CycleHistoryEntry {
  cycleNumber: number;
  avgEngagementRate: number;
  avgPerformanceScore: number;
  totalContent: number;
  dateRange: { start: Date; end: Date };
}

export interface RankedContentResult {
  id: string;
  engagementRate: number;
  performanceScore: number;
  combinedScore: number;
  platform?: string;
  contentType?: string;
  hookUsed?: string;
  promptUsed?: string;
  measuredAt?: Date;
}

@Injectable()
export class OptimizationCycleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run a full optimization cycle: analyze past performance, extract patterns,
   * generate recommendations and next-batch suggestions.
   */
  async runOptimizationCycle(
    organizationId: string,
    brandId: string,
    options: OptimizationCycleOptions = {},
  ): Promise<OptimizationCycleResult> {
    const { topN = 10 } = options;

    const where = this.buildWhereFilter(organizationId, brandId, options);

    const [rankedContent, cycleStats] = await Promise.all([
      this.getRankedContent(where, topN),
      this.computeCycleStats(organizationId, where, options),
    ]);

    const topPatterns = this.extractPatterns(rankedContent);
    const recommendations = this.generateRecommendations(topPatterns);
    const nextBatchSuggestions = this.buildSuggestionsFromPatterns(
      topPatterns,
      recommendations,
    );

    return { cycleStats, nextBatchSuggestions, recommendations, topPatterns };
  }

  /**
   * Get history of past optimization cycles with engagement trends.
   */
  async getCycleHistory(
    organizationId: string,
    brandId: string,
  ): Promise<CycleHistoryEntry[]> {
    const rows = await this.prisma.contentPerformance.groupBy({
      _count: { _all: true },
      _max: { measuredAt: true },
      _min: { measuredAt: true },
      _sum: { engagementRate: true, performanceScore: true },
      by: ['cycleNumber'],
      where: scopedWhere(organizationId, { brandId }),
    });
    const grouped = new Map<number, (typeof rows)[number]>();

    for (const row of rows) {
      const cycleNumber = row.cycleNumber ?? 0;
      const existing = grouped.get(cycleNumber);
      if (!existing) {
        grouped.set(cycleNumber, {
          ...row,
          _count: { ...row._count },
          _max: { ...row._max },
          _min: { ...row._min },
          _sum: { ...row._sum },
        });
        continue;
      }
      existing._count._all += row._count._all;
      existing._sum.engagementRate =
        (existing._sum.engagementRate ?? 0) + (row._sum.engagementRate ?? 0);
      existing._sum.performanceScore =
        (existing._sum.performanceScore ?? 0) +
        (row._sum.performanceScore ?? 0);
      if (
        row._min.measuredAt &&
        (!existing._min.measuredAt ||
          row._min.measuredAt < existing._min.measuredAt)
      ) {
        existing._min.measuredAt = row._min.measuredAt;
      }
      if (
        row._max.measuredAt &&
        (!existing._max.measuredAt ||
          row._max.measuredAt > existing._max.measuredAt)
      ) {
        existing._max.measuredAt = row._max.measuredAt;
      }
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([cycleNumber, aggregate]) => ({
        avgEngagementRate:
          (aggregate._sum.engagementRate ?? 0) /
          Math.max(aggregate._count._all, 1),
        avgPerformanceScore:
          (aggregate._sum.performanceScore ?? 0) /
          Math.max(aggregate._count._all, 1),
        cycleNumber,
        dateRange: {
          end: aggregate._max.measuredAt ?? new Date(),
          start: aggregate._min.measuredAt ?? new Date(),
        },
        totalContent: aggregate._count._all,
      }));
  }

  private buildWhereFilter(
    organizationId: string,
    brandId: string,
    options: OptimizationCycleOptions = {},
  ): Record<string, unknown> {
    return scopedWhere(organizationId, {
      brandId,
      ...(options.cycleNumber !== undefined
        ? { cycleNumber: options.cycleNumber }
        : {}),
      ...(options.startDate || options.endDate
        ? {
            measuredAt: {
              ...(options.startDate
                ? { gte: new Date(options.startDate) }
                : {}),
              ...(options.endDate ? { lte: new Date(options.endDate) } : {}),
            },
          }
        : {}),
    });
  }

  private async getRankedContent(
    where: Record<string, unknown>,
    limit: number,
  ): Promise<RankedContentResult[]> {
    const rows = (await this.prisma.contentPerformance.findMany({
      take: limit * 3, // Fetch more to sort by combinedScore in memory
      where: where as Prisma.ContentPerformanceWhereInput,
    })) as unknown as ContentPerformanceDocument[];

    return rows
      .map((r) => ({
        combinedScore:
          (r.engagementRate ?? 0) * 0.6 + (r.performanceScore ?? 0) * 0.4,
        contentType: r.contentType ?? undefined,
        engagementRate: r.engagementRate ?? 0,
        hookUsed: r.hookUsed,
        id: r.id,
        measuredAt:
          r.measuredAt instanceof Date
            ? r.measuredAt
            : typeof r.measuredAt === 'string'
              ? new Date(r.measuredAt)
              : undefined,
        performanceScore: r.performanceScore ?? 0,
        platform: r.platform ?? undefined,
        promptUsed: r.promptUsed,
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit);
  }

  private async computeCycleStats(
    organizationId: string,
    where: Record<string, unknown>,
    options: OptimizationCycleOptions,
  ): Promise<CycleStats> {
    const aggregate = await this.prisma.contentPerformance.aggregate({
      _count: { _all: true, cycleNumber: true, engagementRate: true },
      _max: { cycleNumber: true, engagementRate: true, measuredAt: true },
      _min: { engagementRate: true, measuredAt: true },
      _sum: { engagementRate: true, performanceScore: true },
      where: scopedWhere(organizationId, where),
    });
    const totalContent = aggregate._count._all;
    const hasMissingEngagement = aggregate._count.engagementRate < totalContent;
    const hasMissingCycle = aggregate._count.cycleNumber < totalContent;
    const maximumEngagement = aggregate._max.engagementRate ?? 0;
    const minimumEngagement = aggregate._min.engagementRate ?? 0;
    const maximumCycle = aggregate._max.cycleNumber ?? 1;

    return {
      avgEngagementRate:
        (aggregate._sum.engagementRate ?? 0) / Math.max(totalContent, 1),
      avgPerformanceScore:
        (aggregate._sum.performanceScore ?? 0) / Math.max(totalContent, 1),
      bottomEngagementRate: hasMissingEngagement
        ? Math.min(minimumEngagement, 0)
        : minimumEngagement,
      cycleNumber:
        options.cycleNumber ??
        (hasMissingCycle ? Math.max(maximumCycle, 1) : maximumCycle),
      dateRange: {
        end: (aggregate._max.measuredAt ?? new Date()).toISOString(),
        start: (aggregate._min.measuredAt ?? new Date()).toISOString(),
      },
      topEngagementRate: hasMissingEngagement
        ? Math.max(maximumEngagement, 0)
        : maximumEngagement,
      totalContent,
    };
  }

  private extractPatterns(content: RankedContentResult[]): TopPatterns {
    const hookMap = new Map<
      string,
      { total: number; scoreTotal: number; count: number }
    >();
    const timeMap = new Map<number, { total: number; count: number }>();
    const platformMap = new Map<string, { total: number; count: number }>();
    const contentTypeMap = new Map<string, { total: number; count: number }>();

    for (const item of content) {
      // Hooks
      const hook = (item.hookUsed || item.promptUsed || '').trim();
      if (hook) {
        const snippet = hook.substring(0, 100);
        const existing = hookMap.get(snippet) || {
          count: 0,
          scoreTotal: 0,
          total: 0,
        };
        existing.total += item.engagementRate || 0;
        existing.scoreTotal += item.performanceScore || 0;
        existing.count += 1;
        hookMap.set(snippet, existing);
      }

      // Posting times
      if (item.measuredAt) {
        const hour = new Date(item.measuredAt).getUTCHours();
        const existing = timeMap.get(hour) || { count: 0, total: 0 };
        existing.total += item.engagementRate || 0;
        existing.count += 1;
        timeMap.set(hour, existing);
      }

      // Platforms
      if (item.platform) {
        const existing = platformMap.get(item.platform) || {
          count: 0,
          total: 0,
        };
        existing.total += item.engagementRate || 0;
        existing.count += 1;
        platformMap.set(item.platform, existing);
      }

      // Content types
      if (item.contentType) {
        const existing = contentTypeMap.get(item.contentType) || {
          count: 0,
          total: 0,
        };
        existing.total += item.engagementRate || 0;
        existing.count += 1;
        contentTypeMap.set(item.contentType, existing);
      }
    }

    const hooks: PatternInsight[] = Array.from(hookMap.entries())
      .map(([pattern, data]) => ({
        avgEngagementRate: data.count > 0 ? data.total / data.count : 0,
        avgPerformanceScore: data.count > 0 ? data.scoreTotal / data.count : 0,
        frequency: data.count,
        pattern,
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

    const postingTimes = Array.from(timeMap.entries())
      .map(([hour, data]) => ({
        avgEngagementRate: data.count > 0 ? data.total / data.count : 0,
        count: data.count,
        hour,
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

    const platforms = Array.from(platformMap.entries())
      .map(([platform, data]) => ({
        avgEngagementRate: data.count > 0 ? data.total / data.count : 0,
        count: data.count,
        platform,
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

    const contentTypes = Array.from(contentTypeMap.entries())
      .map(([contentType, data]) => ({
        avgEngagementRate: data.count > 0 ? data.total / data.count : 0,
        contentType,
        count: data.count,
      }))
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

    return {
      contentTypes,
      hooks,
      platforms,
      postingTimes,
      sentimentStyles: [], // Future: NLP-based sentiment extraction
    };
  }

  private generateRecommendations(
    patterns: TopPatterns,
  ): OptimizationRecommendation[] {
    const recs: OptimizationRecommendation[] = [];

    // Hook recommendations
    if (patterns.hooks.length > 0) {
      const best = patterns.hooks[0];
      recs.push({
        basedOn: best.frequency,
        category: 'hook',
        confidence: Math.min(best.frequency / 5, 1),
        recommendation: `Use hooks similar to: "${best.pattern}" (avg engagement: ${(best.avgEngagementRate * 100).toFixed(1)}%)`,
      });
    }

    // Timing recommendations
    if (patterns.postingTimes.length > 0) {
      const best = patterns.postingTimes[0];
      recs.push({
        basedOn: best.count,
        category: 'timing',
        confidence: Math.min(best.count / 10, 1),
        recommendation: `Post around ${this.formatHour(best.hour)} for best engagement`,
      });
    }

    // Platform recommendations
    if (patterns.platforms.length > 0) {
      const best = patterns.platforms[0];
      recs.push({
        basedOn: best.count,
        category: 'platform',
        confidence: Math.min(best.count / 10, 1),
        recommendation: `Focus on ${best.platform} — highest avg engagement at ${(best.avgEngagementRate * 100).toFixed(1)}%`,
      });
    }

    // Content type recommendations
    if (patterns.contentTypes.length > 0) {
      const best = patterns.contentTypes[0];
      recs.push({
        basedOn: best.count,
        category: 'contentType',
        confidence: Math.min(best.count / 10, 1),
        recommendation: `Prioritize ${best.contentType} content — best performing format`,
      });
    }

    return recs;
  }

  private buildSuggestionsFromPatterns(
    patterns: TopPatterns,
    recommendations: OptimizationRecommendation[],
  ): GenerationSuggestion[] {
    const suggestions: GenerationSuggestion[] = [];
    const bestPlatform = patterns.platforms[0]?.platform || 'instagram';
    const bestHour = patterns.postingTimes[0]?.hour ?? 12;
    const bestContentType = patterns.contentTypes[0]?.contentType || 'post';

    for (const hook of patterns.hooks.slice(0, 3)) {
      suggestions.push({
        confidence: Math.min(hook.avgEngagementRate / 10, 1),
        prompt: `Create a ${bestContentType} for ${bestPlatform}. Use a hook similar to: "${hook.pattern}". Optimize for engagement.`,
        suggestedHook: hook.pattern,
        suggestedPlatform: bestPlatform,
        suggestedPostTime: this.formatHour(bestHour),
      });
    }

    // If no hooks, generate a generic suggestion
    if (suggestions.length === 0) {
      const platformRec = recommendations.find(
        (r) => r.category === 'platform',
      );
      suggestions.push({
        confidence: platformRec?.confidence ?? 0.3,
        prompt: `Create engaging ${bestContentType} content for ${bestPlatform}. Focus on high engagement.`,
        suggestedHook: '',
        suggestedPlatform: bestPlatform,
        suggestedPostTime: this.formatHour(bestHour),
      });
    }

    return suggestions;
  }

  private formatHour(hour: number): string {
    const amPm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:00 ${amPm}`;
  }
}
