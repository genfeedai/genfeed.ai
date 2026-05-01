import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import {
  type OptimizationCycleResult,
  OptimizationCycleService,
} from '@api/collections/content-performance/services/optimization-cycle.service';
import {
  type PerformanceContentItem,
  PerformanceSummaryService,
  type WeeklySummary,
} from '@api/collections/content-performance/services/performance-summary.service';
import { OpenAiLlmService } from '@api/services/integrations/openai-llm/services/openai-llm.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// ─── Interfaces ──────────────────────────────────────────────────────

export interface PerformanceAnalysis {
  summary: WeeklySummary;
  optimizationCycle: OptimizationCycleResult;
  insights: string[];
}

export interface AnalyzePerformanceOptions {
  startDate?: Date | string;
  endDate?: Date | string;
  topN?: number;
}

export interface PromptOptimizationResult {
  optimizedPrompt: string;
  reasoning: string;
  suggestions: string[];
  confidenceScore: number;
}

export interface ContentRecommendation {
  category: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  basedOnDataPoints: number;
}

export interface OptimizationRecommendations {
  postingSchedule: Array<{
    platform: string;
    bestHours: number[];
    bestDays?: string[];
  }>;
  contentTypes: Array<{
    type: string;
    avgEngagement: number;
    recommendation: string;
  }>;
  pipelineConfigs: Array<{
    suggestion: string;
    reason: string;
  }>;
  abTestSuggestions: Array<{
    variable: string;
    variantA: string;
    variantB: string;
    hypothesis: string;
  }>;
  general: ContentRecommendation[];
}

export interface OptimizationSuggestion {
  id: string;
  category: 'timing' | 'format' | 'hook';
  suggestion: string;
  confidence: number;
  dataPoints: number;
}

export interface AutoApplyResult {
  suggestionId: string;
  applied: boolean;
  reason?: string;
}

// ─── Service ─────────────────────────────────────────────────────────

@Injectable()
export class ContentOptimizationService {
  private readonly logContext = 'ContentOptimizationService';

  constructor(
    private readonly logger: LoggerService,
    private readonly performanceSummaryService: PerformanceSummaryService,
    private readonly optimizationCycleService: OptimizationCycleService,
    private readonly openAiLlmService: OpenAiLlmService,
    private readonly brandMemoryService: BrandMemoryService,
  ) {}

  // ─── 1. Content Performance Analysis ─────────────────────────────

  async analyzePerformance(
    organizationId: string,
    brandId: string,
    options: AnalyzePerformanceOptions = {},
  ): Promise<PerformanceAnalysis> {
    const caller = `${this.logContext}.analyzePerformance`;
    this.logger.log(caller, { brandId, options });

    const [summary, optimizationCycle] = await Promise.all([
      this.performanceSummaryService.getWeeklySummary(organizationId, brandId, {
        endDate: options.endDate,
        startDate: options.startDate,
        topN: options.topN ?? 10,
      }),
      this.optimizationCycleService.runOptimizationCycle(
        organizationId,
        brandId,
        { topN: options.topN ?? 10 },
      ),
    ]);

    const insights = this.deriveInsights(summary, optimizationCycle);

    return { insights, optimizationCycle, summary };
  }

  // ─── 2. Prompt Optimization ──────────────────────────────────────

  async optimizePrompt(
    organizationId: string,
    brandId: string,
    originalPrompt: string,
  ): Promise<PromptOptimizationResult> {
    const caller = `${this.logContext}.optimizePrompt`;
    this.logger.log(caller, { brandId, promptLength: originalPrompt.length });

    // Gather performance context
    const [topPerformers, worstPerformers, performanceContext] =
      await Promise.all([
        this.performanceSummaryService.getTopPerformers(
          organizationId,
          brandId,
          5,
        ),
        this.performanceSummaryService.getTopPerformers(
          organizationId,
          brandId,
          5,
          // worst = lowest engagement — reuse with reversed expectation
        ),
        this.performanceSummaryService.generatePerformanceContext(
          organizationId,
          brandId,
        ),
      ]);

    const systemPrompt = this.buildOptimizationSystemPrompt(
      topPerformers,
      worstPerformers,
      performanceContext,
    );

    try {
      const response = await this.openAiLlmService.chatCompletion({
        max_tokens: 1500,
        messages: [
          { content: systemPrompt, role: 'system' },
          {
            content: `Optimize this content prompt for better engagement:\n\n"${originalPrompt}"\n\nReturn JSON with keys: optimizedPrompt, reasoning, suggestions (array of strings), confidenceScore (0-1).`,
            role: 'user',
          },
        ],
        model: 'gpt-4o-mini',
        temperature: 0.7,
      });

      const content = response.choices?.[0]?.message?.content ?? '';
      return this.parseOptimizationResponse(content, originalPrompt);
    } catch (error) {
      this.logger.error(`${caller} LLM call failed, using heuristic`, error);
      return this.heuristicOptimize(originalPrompt, topPerformers);
    }
  }

  // ─── 3. query Recommendations ─────────────────────────────────

  async getRecommendations(
    organizationId: string,
    brandId: string,
  ): Promise<OptimizationRecommendations> {
    const caller = `${this.logContext}.getRecommendations`;
    this.logger.log(caller, { brandId });

    const analysis = await this.analyzePerformance(organizationId, brandId);
    const { summary, optimizationCycle } = analysis;

    // Posting schedule
    const postingSchedule = summary.avgEngagementByPlatform.map((p) => {
      const platformTimes = summary.bestPostingTimes
        .filter((t) => t.postCount >= 2)
        .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
        .slice(0, 3)
        .map((t) => t.hour);

      return {
        bestHours: platformTimes.length > 0 ? platformTimes : [9, 12, 18],
        platform: p.platform,
      };
    });

    // Content type recommendations
    const contentTypes = summary.avgEngagementByContentType.map((ct) => ({
      avgEngagement: ct.avgEngagementRate,
      recommendation:
        ct.avgEngagementRate > 5
          ? `${ct.category} content performs well — increase production`
          : ct.avgEngagementRate > 2
            ? `${ct.category} content is average — experiment with variations`
            : `${ct.category} content underperforms — consider reducing or pivoting`,
      type: ct.category,
    }));

    // query config suggestions
    const pipelineConfigs = this.derivePipelineConfigs(summary);

    // A/B test suggestions
    const abTestSuggestions = this.deriveAbTestSuggestions(
      summary,
      optimizationCycle,
    );

    // General recommendations from optimization cycle
    const general: ContentRecommendation[] =
      optimizationCycle.recommendations.map((r) => ({
        basedOnDataPoints: r.basedOn,
        category: r.category,
        priority:
          r.confidence > 0.7
            ? ('high' as const)
            : r.confidence > 0.4
              ? ('medium' as const)
              : ('low' as const),
        recommendation: r.recommendation,
      }));

    return {
      abTestSuggestions,
      contentTypes,
      general,
      pipelineConfigs,
      postingSchedule,
    };
  }

  async generateSuggestions(
    organizationId: string,
    brandId: string,
  ): Promise<OptimizationSuggestion[]> {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const memory = await this.brandMemoryService.getMemory(
      organizationId,
      brandId,
      {
        from,
        to,
      },
    );

    const topTimeCounts = new Map<string, number>();
    const topFormatCounts = new Map<string, number>();
    const hookCounts = new Map<string, number>();

    for (const row of memory) {
      if (row.metrics?.topPerformingTime) {
        const count = topTimeCounts.get(row.metrics.topPerformingTime) ?? 0;
        topTimeCounts.set(row.metrics.topPerformingTime, count + 1);
      }

      if (row.metrics?.topPerformingFormat) {
        const count = topFormatCounts.get(row.metrics.topPerformingFormat) ?? 0;
        topFormatCounts.set(row.metrics.topPerformingFormat, count + 1);
      }

      for (const entry of row.entries ?? []) {
        if (entry.type === 'hook' || entry.type === 'hook_pattern') {
          const count = hookCounts.get(entry.content) ?? 0;
          hookCounts.set(entry.content, count + 1);
        }
      }
    }

    const suggestions: OptimizationSuggestion[] = [];
    const topTime = this.pickTopValue(topTimeCounts);
    const topFormat = this.pickTopValue(topFormatCounts);
    const topHook = this.pickTopValue(hookCounts);

    if (topTime) {
      suggestions.push({
        category: 'timing',
        confidence: this.computeConfidence(topTime.count, memory.length),
        dataPoints: topTime.count,
        id: this.buildSuggestionId('timing', topTime.value),
        suggestion: `Concentrate posting around ${topTime.value}; this time window consistently appears in top daily performance.`,
      });
    }

    if (topFormat) {
      suggestions.push({
        category: 'format',
        confidence: this.computeConfidence(topFormat.count, memory.length),
        dataPoints: topFormat.count,
        id: this.buildSuggestionId('format', topFormat.value),
        suggestion: `Increase ${topFormat.value} output; this format appears most often in your top-performing days.`,
      });
    }

    if (topHook) {
      suggestions.push({
        category: 'hook',
        confidence: this.computeConfidence(topHook.count, memory.length),
        dataPoints: topHook.count,
        id: this.buildSuggestionId('hook', topHook.value),
        suggestion: `Reuse this winning hook structure: "${topHook.value}".`,
      });
    }

    return suggestions.sort(
      (left, right) => right.confidence - left.confidence,
    );
  }

  async autoApplySuggestion(
    organizationId: string,
    brandId: string,
    suggestionId: string,
  ): Promise<AutoApplyResult> {
    const minConfidenceThreshold = 0.75;
    const suggestions = await this.generateSuggestions(organizationId, brandId);
    const suggestion = suggestions.find((item) => item.id === suggestionId);

    if (!suggestion) {
      return { applied: false, reason: 'Suggestion not found', suggestionId };
    }

    if (suggestion.confidence < minConfidenceThreshold) {
      return {
        applied: false,
        reason: `Confidence ${suggestion.confidence.toFixed(2)} below threshold ${minConfidenceThreshold.toFixed(2)}`,
        suggestionId,
      };
    }

    await this.brandMemoryService.logEntry(organizationId, brandId, {
      content: `Auto-applied optimization: ${suggestion.suggestion}`,
      metadata: {
        confidence: suggestion.confidence,
        dataPoints: suggestion.dataPoints,
        suggestionId: suggestion.id,
      },
      type: 'optimization_auto_apply',
    });

    await this.brandMemoryService.addInsight(organizationId, brandId, {
      category: suggestion.category,
      confidence: suggestion.confidence,
      insight: `Applied optimization: ${suggestion.suggestion}`,
      source: 'optimization_engine',
    });

    return { applied: true, suggestionId };
  }

  // ─── Private Helpers ─────────────────────────────────────────────

  private deriveInsights(
    summary: WeeklySummary,
    cycle: OptimizationCycleResult,
  ): string[] {
    const insights: string[] = [];

    // Trend
    const { direction, percentageChange } = summary.weekOverWeekTrend;
    if (direction === 'up') {
      insights.push(
        `Engagement is trending UP ${percentageChange.toFixed(1)}% week-over-week.`,
      );
    } else if (direction === 'down') {
      insights.push(
        `Engagement is trending DOWN ${Math.abs(percentageChange).toFixed(1)}% week-over-week — action needed.`,
      );
    }

    // Best platform
    if (summary.avgEngagementByPlatform.length > 0) {
      const best = summary.avgEngagementByPlatform[0];
      insights.push(
        `${best.platform} is your best-performing platform (${best.avgEngagementRate.toFixed(2)}% avg engagement).`,
      );
    }

    // Top hooks
    if (summary.topHooks.length > 0) {
      insights.push(
        `Your top-performing hooks start with: "${summary.topHooks[0]}..."`,
      );
    }

    // Cycle stats
    if (cycle.cycleStats.totalContent > 0) {
      insights.push(
        `Analyzed ${cycle.cycleStats.totalContent} pieces of content with avg engagement ${cycle.cycleStats.avgEngagementRate.toFixed(2)}%.`,
      );
    }

    return insights;
  }

  private buildOptimizationSystemPrompt(
    topPerformers: PerformanceContentItem[],
    _worstPerformers: PerformanceContentItem[],
    performanceContext: string,
  ): string {
    const topExamples = topPerformers
      .slice(0, 3)
      .map(
        (p) =>
          `- "${(p.description || p.title).substring(0, 100)}" (engagement: ${p.engagementRate.toFixed(2)}%)`,
      )
      .join('\n');

    return `You are a content optimization AI. Analyze content performance data and improve prompts.

Performance context: ${performanceContext}

Top performing content:
${topExamples || 'No data yet.'}

Your job: take the user's content prompt and optimize it based on what has worked historically.
Return ONLY valid JSON.`;
  }

  private parseOptimizationResponse(
    content: string,
    originalPrompt: string,
  ): PromptOptimizationResult {
    try {
      // Extract JSON from possible markdown code blocks
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        confidenceScore: Math.min(
          1,
          Math.max(0, Number(parsed.confidenceScore) || 0.5),
        ),
        optimizedPrompt: String(parsed.optimizedPrompt || originalPrompt),
        reasoning: String(parsed.reasoning || ''),
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.map(String)
          : [],
      };
    } catch {
      return {
        confidenceScore: 0.3,
        optimizedPrompt: originalPrompt,
        reasoning: 'Failed to parse AI response; returning original prompt.',
        suggestions: [],
      };
    }
  }

  private heuristicOptimize(
    originalPrompt: string,
    topPerformers: PerformanceContentItem[],
  ): PromptOptimizationResult {
    const suggestions: string[] = [];

    if (topPerformers.length > 0) {
      const topHook = (
        topPerformers[0].description || topPerformers[0].title
      ).split(/[.\n]/)[0];
      if (topHook) {
        suggestions.push(`Consider a hook style similar to: "${topHook}"`);
      }
    }

    suggestions.push('Keep prompts under 200 characters for better engagement');
    suggestions.push('Include a clear call-to-action');

    return {
      confidenceScore: 0.4,
      optimizedPrompt: originalPrompt,
      reasoning:
        'Heuristic-based suggestions (AI optimization unavailable). Review top-performing content hooks for inspiration.',
      suggestions,
    };
  }

  private derivePipelineConfigs(
    summary: WeeklySummary,
  ): Array<{ suggestion: string; reason: string }> {
    const configs: Array<{ suggestion: string; reason: string }> = [];

    const bestContentType = summary.avgEngagementByContentType[0];
    if (bestContentType) {
      if (
        bestContentType.category === 'video' ||
        bestContentType.category === 'reel'
      ) {
        configs.push({
          reason: `${bestContentType.category} content averages ${bestContentType.avgEngagementRate.toFixed(2)}% engagement`,
          suggestion:
            'Prioritize T2I → I2V pipeline steps for video-first content',
        });
      } else if (bestContentType.category === 'image') {
        configs.push({
          reason: `Image content averages ${bestContentType.avgEngagementRate.toFixed(2)}% engagement`,
          suggestion:
            'Focus on high-quality T2I generation; skip I2V for most posts',
        });
      }
    }

    if (summary.weekOverWeekTrend.direction === 'down') {
      configs.push({
        reason: `Engagement is declining ${Math.abs(summary.weekOverWeekTrend.percentageChange).toFixed(0)}%`,
        suggestion:
          'Experiment with different generation models to refresh content style',
      });
    }

    return configs;
  }

  private deriveAbTestSuggestions(
    summary: WeeklySummary,
    cycle: OptimizationCycleResult,
  ): Array<{
    variable: string;
    variantA: string;
    variantB: string;
    hypothesis: string;
  }> {
    const suggestions: Array<{
      variable: string;
      variantA: string;
      variantB: string;
      hypothesis: string;
    }> = [];

    // Time-based A/B test
    if (summary.bestPostingTimes.length >= 2) {
      const [best, second] = summary.bestPostingTimes;
      suggestions.push({
        hypothesis: `Posting at ${best.hour}:00 may outperform ${second.hour}:00 by ${(((best.avgEngagementRate - second.avgEngagementRate) / second.avgEngagementRate) * 100).toFixed(0)}%`,
        variable: 'posting_time',
        variantA: `${best.hour}:00`,
        variantB: `${second.hour}:00`,
      });
    }

    // Hook-based A/B test
    if (cycle.nextBatchSuggestions.length >= 2) {
      const [a, b] = cycle.nextBatchSuggestions;
      suggestions.push({
        hypothesis:
          'Testing different hook styles to find optimal engagement pattern',
        variable: 'hook_style',
        variantA: a.suggestedHook,
        variantB: b.suggestedHook,
      });
    }

    // Content type A/B test
    if (summary.avgEngagementByContentType.length >= 2) {
      const [best, second] = summary.avgEngagementByContentType;
      suggestions.push({
        hypothesis: `${best.category} may consistently outperform ${second.category}`,
        variable: 'content_type',
        variantA: best.category,
        variantB: second.category,
      });
    }

    return suggestions;
  }

  private computeConfidence(count: number, totalDays: number): number {
    if (count <= 0 || totalDays <= 0) {
      return 0;
    }

    return Math.min(0.98, Math.max(0.4, count / totalDays));
  }

  private pickTopValue(
    source: Map<string, number>,
  ): { value: string; count: number } | null {
    let bestValue: string | null = null;
    let bestCount = 0;

    for (const [value, count] of source.entries()) {
      if (count > bestCount) {
        bestValue = value;
        bestCount = count;
      }
    }

    if (!bestValue) {
      return null;
    }

    return {
      count: bestCount,
      value: bestValue,
    };
  }

  private buildSuggestionId(
    category: OptimizationSuggestion['category'],
    value: string,
  ): string {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    return `${category}-${slug}`;
  }
}
