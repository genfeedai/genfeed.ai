import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

// ─── Interfaces ──────────────────────────────────────────────────────

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
  dateRange: { start: Date; end: Date };
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

// ─── Service ─────────────────────────────────────────────────────────

@Injectable()
export class OptimizationCycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performanceSummaryService: PerformanceSummaryService,
  ) {}

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
      this.computeCycleStats(where, options),
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
   * Generate next batch of content prompts biased toward what works.
   */
  async generateNextBatchPrompts(
    organizationId: string,
    brandId: string,
    count: number = 5,
  ): Promise<GenerationSuggestion[]> {
    const [cycleResult, performanceContext] = await Promise.all([
      this.runOptimizationCycle(organizationId, brandId),
      this.performanceSummaryService.generatePerformanceContext(
        organizationId,
        brandId,
      ),
    ]);

    const { topPatterns, recommendations } = cycleResult;

    const suggestions: GenerationSuggestion[] = [];

    const topHooks = topPatterns.hooks.slice(0, Math.max(count, 3));
    const bestPlatform = topPatterns.platforms[0]?.platform || 'instagram';
    const bestHour = topPatterns.postingTimes[0]?.hour ?? 12;
    const bestContentType = topPatterns.contentTypes[0]?.contentType || 'post';

    const styleRecs = recommendations
      .filter((r) => r.category === 'style')
      .map((r) => r.recommendation);

    const timingStr = this.formatHour(bestHour);

    for (let i = 0; i < count; i++) {
      const hookInsight = topHooks[i % topHooks.length];
      const hookText = hookInsight?.pattern || '';

      const prompt = [
        `Create a ${bestContentType} for ${bestPlatform}.`,
        hookText ? `Use a hook similar to: "${hookText}"` : '',
        styleRecs.length > 0 ? `Style guidance: ${styleRecs[0]}` : '',
        `Performance context: ${performanceContext}`,
        `Optimize for engagement.`,
      ]
        .filter(Boolean)
        .join(' ');

      suggestions.push({
        confidence: hookInsight
          ? Math.min(hookInsight.avgEngagementRate / 10, 1)
          : 0.5,
        prompt,
        suggestedHook: hookText,
        suggestedPlatform: bestPlatform,
        suggestedPostTime: timingStr,
      });
    }

    return suggestions;
  }

  /**
   * Get history of past optimization cycles with engagement trends.
   */
  async getCycleHistory(
    organizationId: string,
    brandId: string,
  ): Promise<CycleHistoryEntry[]> {
    const rows = await this.prisma.contentPerformance.groupBy({
      _avg: { engagementRate: true, performanceScore: true },
      _count: { id: true },
      _max: { measuredAt: true },
      _min: { measuredAt: true },
      by: ['cycleNumber'],
      orderBy: { cycleNumber: 'asc' },
      where: { brandId, isDeleted: false, organizationId },
    });

    return rows.map((r) => ({
      avgEngagementRate: r._avg.engagementRate ?? 0,
      avgPerformanceScore: r._avg.performanceScore ?? 0,
      cycleNumber: r.cycleNumber ?? 0,
      dateRange: {
        end: r._max.measuredAt ?? new Date(),
        start: r._min.measuredAt ?? new Date(),
      },
      totalContent: r._count.id,
    }));
  }

  // ─── Private ─────────────────────────────────────────────────────

  private buildWhereFilter(
    organizationId: string,
    brandId: string,
    options: OptimizationCycleOptions = {},
  ): Record<string, unknown> {
    return {
      brandId,
      isDeleted: false,
      organizationId,
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
    };
  }

  private async getRankedContent(
    where: Record<string, unknown>,
    limit: number,
  ): Promise<RankedContentResult[]> {
    const rows = await this.prisma.contentPerformance.findMany({
      take: limit * 3, // Fetch more to sort by combinedScore in memory
      where: where as never,
    });

    return rows
      .map((r) => ({
        combinedScore:
          (r.engagementRate ?? 0) * 0.6 + (r.performanceScore ?? 0) * 0.4,
        contentType: r.contentType ?? undefined,
        engagementRate: r.engagementRate ?? 0,
        hookUsed: (r as Record<string, unknown>).hookUsed as string | undefined,
        id: r.id,
        measuredAt: r.measuredAt ?? undefined,
        performanceScore: r.performanceScore ?? 0,
        platform: r.platform ?? undefined,
        promptUsed: (r as Record<string, unknown>).promptUsed as
          | string
          | undefined,
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit);
  }

  private async computeCycleStats(
    where: Record<string, unknown>,
    options: OptimizationCycleOptions,
  ): Promise<CycleStats> {
    const agg = await this.prisma.contentPerformance.aggregate({
      _avg: { engagementRate: true, performanceScore: true },
      _count: { id: true },
      _max: { cycleNumber: true, engagementRate: true, measuredAt: true },
      _min: { engagementRate: true, measuredAt: true },
      where: where as never,
    });

    return {
      avgEngagementRate: agg._avg.engagementRate ?? 0,
      avgPerformanceScore: agg._avg.performanceScore ?? 0,
      bottomEngagementRate: agg._min.engagementRate ?? 0,
      cycleNumber: options.cycleNumber ?? agg._max.cycleNumber ?? 1,
      dateRange: {
        end: agg._max.measuredAt ?? new Date(),
        start: agg._min.measuredAt ?? new Date(),
      },
      topEngagementRate: agg._max.engagementRate ?? 0,
      totalContent: agg._count.id,
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
