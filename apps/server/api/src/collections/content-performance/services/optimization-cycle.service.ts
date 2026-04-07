import {
  ContentPerformance,
  type ContentPerformanceDocument,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

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
  _id: Types.ObjectId;
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
    @InjectModel(ContentPerformance.name, DB_CONNECTIONS.CLOUD)
    private readonly contentPerformanceModel: AggregatePaginateModel<ContentPerformanceDocument>,
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

    const matchFilter = this.buildMatchFilter(organizationId, brandId, options);

    const [rankedContent, cycleStats] = await Promise.all([
      this.getRankedContent(matchFilter, topN),
      this.computeCycleStats(matchFilter, options),
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
    const pipeline: PipelineStage[] = [
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
      },
      {
        $group: {
          _id: '$cycleNumber',
          avgEngagementRate: { $avg: '$engagementRate' },
          avgPerformanceScore: { $avg: '$performanceScore' },
          endDate: { $max: '$measuredAt' },
          startDate: { $min: '$measuredAt' },
          totalContent: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await this.contentPerformanceModel.aggregate(pipeline);

    return results.map((r: Record<string, unknown>) => ({
      avgEngagementRate: Number(r.avgEngagementRate || 0),
      avgPerformanceScore: Number(r.avgPerformanceScore || 0),
      cycleNumber: Number(r._id),
      dateRange: {
        end: r.endDate as Date,
        start: r.startDate as Date,
      },
      totalContent: Number(r.totalContent || 0),
    }));
  }

  // ─── Private ─────────────────────────────────────────────────────

  private buildMatchFilter(
    organizationId: string,
    brandId: string,
    options: OptimizationCycleOptions = {},
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      brand: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };

    if (options.cycleNumber !== undefined) {
      filter.cycleNumber = options.cycleNumber;
    }

    if (options.startDate || options.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (options.startDate) {
        dateFilter.$gte = new Date(options.startDate);
      }
      if (options.endDate) {
        dateFilter.$lte = new Date(options.endDate);
      }
      filter.measuredAt = dateFilter;
    }

    return filter;
  }

  private async getRankedContent(
    matchFilter: Record<string, unknown>,
    limit: number,
  ): Promise<RankedContentResult[]> {
    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $addFields: {
          combinedScore: {
            $add: [
              { $multiply: ['$engagementRate', 0.6] },
              { $multiply: ['$performanceScore', 0.4] },
            ],
          },
        },
      },
      { $sort: { combinedScore: -1 } },
      { $limit: limit },
    ];

    return this.contentPerformanceModel.aggregate<RankedContentResult>(
      pipeline,
    );
  }

  private async computeCycleStats(
    matchFilter: Record<string, unknown>,
    options: OptimizationCycleOptions,
  ): Promise<CycleStats> {
    const pipeline: PipelineStage[] = [
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          avgEngagementRate: { $avg: '$engagementRate' },
          avgPerformanceScore: { $avg: '$performanceScore' },
          bottomEngagementRate: { $min: '$engagementRate' },
          endDate: { $max: '$measuredAt' },
          maxCycle: { $max: '$cycleNumber' },
          startDate: { $min: '$measuredAt' },
          topEngagementRate: { $max: '$engagementRate' },
          totalContent: { $sum: 1 },
        },
      },
    ];

    const results = await this.contentPerformanceModel.aggregate(pipeline);
    const r = results[0] || {};

    return {
      avgEngagementRate: Number(r.avgEngagementRate || 0),
      avgPerformanceScore: Number(r.avgPerformanceScore || 0),
      bottomEngagementRate: Number(r.bottomEngagementRate || 0),
      cycleNumber: options.cycleNumber ?? Number(r.maxCycle || 1),
      dateRange: {
        end: (r.endDate as Date) || new Date(),
        start: (r.startDate as Date) || new Date(),
      },
      topEngagementRate: Number(r.topEngagementRate || 0),
      totalContent: Number(r.totalContent || 0),
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
