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
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import type { AbTestOutcome } from '@api/services/content-optimization/ab-test-suggestion-harness.types';
import {
  CONTENT_OPTIMIZATION_ACTION_IDS,
  CONTENT_OPTIMIZATION_WORKFLOW_DEFINITIONS,
  CONTENT_OPTIMIZATION_WORKFLOW_IDS,
} from '@api/services/content-optimization/content-optimization-workflow-definition';
import { OpenAiLlmService } from '@api/services/integrations/openai-llm/services/openai-llm.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

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
  validatedAbTests: AbTestOutcome[];
}

export interface TimingSuggestionPayload {
  preferredTime: string;
}

export interface FormatSuggestionPayload {
  preferredFormat: string;
}

export interface HookSuggestionPayload {
  hook: string;
}

export type OptimizationSuggestionPayload =
  | TimingSuggestionPayload
  | FormatSuggestionPayload
  | HookSuggestionPayload;

export interface OptimizationSuggestion {
  id: string;
  category: 'timing' | 'format' | 'hook';
  suggestion: string;
  confidence: number;
  dataPoints: number;
  payload: OptimizationSuggestionPayload;
}

export type AutoApplyStatus =
  | 'applied'
  | 'not_found'
  | 'below_threshold'
  | 'not_auto_applicable';

export interface AutoApplyResult {
  suggestionId: string;
  applied: boolean;
  status: AutoApplyStatus;
  reason?: string;
}

/**
 * A winning content-run signal, extracted at the point a run's winning variant
 * is identified (issue #166). Used to feed insights back into trend ingestion.
 */
export interface WinnerContentSignal {
  variantId: string;
  contentRunId?: string;
  hook?: string;
  format?: string;
  platform?: string;
  avgEngagementRate?: number;
  keywords?: string[];
  hashtags?: string[];
}

export interface RequeueWinnerResult {
  requeued: boolean;
  reason?: string;
  trendPreferencesId?: string;
  addedKeywords?: string[];
  addedPlatforms?: string[];
}

// Common English tokens with no signal value as trend keywords.
const HOOK_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'and',
  'are',
  'but',
  'for',
  'from',
  'has',
  'have',
  'how',
  'into',
  'its',
  'new',
  'not',
  'our',
  'out',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'was',
  'were',
  'what',
  'when',
  'why',
  'will',
  'with',
  'you',
  'your',
]);

const MAX_WINNER_KEYWORDS = 8;

// ─── Service ─────────────────────────────────────────────────────────

@Injectable()
export class ContentOptimizationService implements OnModuleInit {
  private readonly logContext = 'ContentOptimizationService';

  constructor(
    private readonly logger: LoggerService,
    private readonly performanceSummaryService: PerformanceSummaryService,
    private readonly optimizationCycleService: OptimizationCycleService,
    private readonly openAiLlmService: OpenAiLlmService,
    private readonly brandMemoryService: BrandMemoryService,
    private readonly trendPreferencesService: TrendPreferencesService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      CONTENT_OPTIMIZATION_ACTION_IDS.LOAD_SUMMARY,
      (request) => this.loadSummaryAction(request),
    );
    this.workflowRunner.registerAction(
      CONTENT_OPTIMIZATION_ACTION_IDS.RUN_CYCLE,
      (request) => this.runCycleAction(request),
    );
    this.workflowRunner.registerAction(
      CONTENT_OPTIMIZATION_ACTION_IDS.DERIVE_ANALYSIS,
      async (request) => this.deriveAnalysisAction(request),
    );
    this.workflowRunner.registerAction(
      CONTENT_OPTIMIZATION_ACTION_IDS.LOAD_PROMPT_CONTEXT,
      (request) => this.loadPromptContextAction(request),
    );
    this.workflowRunner.registerAction(
      CONTENT_OPTIMIZATION_ACTION_IDS.OPTIMIZE_PROMPT,
      (request) => this.optimizePromptAction(request),
    );
    this.workflowRunner.registerAction(
      CONTENT_OPTIMIZATION_ACTION_IDS.DERIVE_RECOMMENDATIONS,
      (request) => this.deriveRecommendationsAction(request),
    );
    this.workflowRunner.registerAction(
      CONTENT_OPTIMIZATION_ACTION_IDS.GENERATE_SUGGESTIONS,
      (request) => this.generateSuggestionsAction(request),
    );
    this.workflowRunner.registerAction(
      CONTENT_OPTIMIZATION_ACTION_IDS.APPLY_SUGGESTION,
      (request) => this.applySuggestionAction(request),
    );
    this.workflowRunner.registerAction(
      CONTENT_OPTIMIZATION_ACTION_IDS.REQUEUE_WINNER,
      (request) => this.requeueWinnerAction(request),
    );
    for (const definition of CONTENT_OPTIMIZATION_WORKFLOW_DEFINITIONS) {
      this.workflowRunner.registerWorkflow(definition);
    }
  }

  // ─── 1. Content Performance Analysis ─────────────────────────────

  async analyzePerformance(
    organizationId: string,
    brandId: string,
    options: AnalyzePerformanceOptions = {},
  ): Promise<PerformanceAnalysis> {
    const normalizedOptions = {
      ...(options.endDate
        ? { endDate: this.toIsoDate(options.endDate, 'endDate') }
        : {}),
      ...(options.startDate
        ? { startDate: this.toIsoDate(options.startDate, 'startDate') }
        : {}),
      ...(options.topN === undefined ? {} : { topN: options.topN }),
    };
    return this.runWorkflow<PerformanceAnalysis>(
      CONTENT_OPTIMIZATION_WORKFLOW_IDS.ANALYZE,
      {
        brandId,
        options: normalizedOptions,
        organizationId,
      },
    );
  }

  // ─── 2. Prompt Optimization ──────────────────────────────────────

  async optimizePrompt(
    organizationId: string,
    brandId: string,
    originalPrompt: string,
  ): Promise<PromptOptimizationResult> {
    return this.runWorkflow<PromptOptimizationResult>(
      CONTENT_OPTIMIZATION_WORKFLOW_IDS.OPTIMIZE_PROMPT,
      {
        brandId,
        organizationId,
        originalPrompt,
      },
    );
  }

  // ─── 3. query Recommendations ─────────────────────────────────

  async getRecommendations(
    organizationId: string,
    brandId: string,
  ): Promise<OptimizationRecommendations> {
    return this.runWorkflow<OptimizationRecommendations>(
      CONTENT_OPTIMIZATION_WORKFLOW_IDS.RECOMMEND,
      {
        brandId,
        organizationId,
      },
    );
  }

  async generateSuggestions(
    organizationId: string,
    brandId: string,
  ): Promise<OptimizationSuggestion[]> {
    return this.runWorkflow<OptimizationSuggestion[]>(
      CONTENT_OPTIMIZATION_WORKFLOW_IDS.SUGGEST,
      {
        brandId,
        organizationId,
      },
    );
  }

  private async performGenerateSuggestions(
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
        payload: { preferredTime: topTime.value },
        suggestion: `Concentrate posting around ${topTime.value}; this time window consistently appears in top daily performance.`,
      });
    }

    if (topFormat) {
      suggestions.push({
        category: 'format',
        confidence: this.computeConfidence(topFormat.count, memory.length),
        dataPoints: topFormat.count,
        id: this.buildSuggestionId('format', topFormat.value),
        payload: { preferredFormat: topFormat.value },
        suggestion: `Increase ${topFormat.value} output; this format appears most often in your top-performing days.`,
      });
    }

    if (topHook) {
      suggestions.push({
        category: 'hook',
        confidence: this.computeConfidence(topHook.count, memory.length),
        dataPoints: topHook.count,
        id: this.buildSuggestionId('hook', topHook.value),
        payload: { hook: topHook.value },
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
    return this.runWorkflow<AutoApplyResult>(
      CONTENT_OPTIMIZATION_WORKFLOW_IDS.APPLY_SUGGESTION,
      {
        brandId,
        organizationId,
        suggestionId,
      },
    );
  }

  private async performApplySuggestion(
    organizationId: string,
    brandId: string,
    suggestionId: string,
    suggestions: OptimizationSuggestion[],
  ): Promise<AutoApplyResult> {
    const minConfidenceThreshold = 0.75;
    const suggestion = suggestions.find((item) => item.id === suggestionId);

    if (!suggestion) {
      return {
        applied: false,
        reason: 'Suggestion not found',
        status: 'not_found',
        suggestionId,
      };
    }

    if (suggestion.confidence < minConfidenceThreshold) {
      return {
        applied: false,
        reason: `Confidence ${suggestion.confidence.toFixed(2)} below threshold ${minConfidenceThreshold.toFixed(2)}`,
        status: 'below_threshold',
        suggestionId,
      };
    }

    const didApply = await this.applySuggestionPayload(
      organizationId,
      brandId,
      suggestion,
    );

    if (!didApply) {
      return {
        applied: false,
        reason: 'Suggestion cannot be auto-applied',
        status: 'not_auto_applicable',
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

    return { applied: true, status: 'applied', suggestionId };
  }

  // ─── 4. Winner → Trend Feedback (issue #166) ─────────────────────

  /**
   * Close the core loop: when a content run's winning variant is identified,
   * feed its signals (platform, hook keywords, format) back into the org/brand's
   * trend preferences so future trend ingestion is biased toward what worked.
   *
   * Gated per-org/brand by the `autoRequeueWinners` trend preference (opt-out).
   * Missing or undefined means requeue; only an explicit `false` skips.
   */
  async requeueWinnerIntoTrends(
    organizationId: string,
    brandId: string | undefined,
    winner: WinnerContentSignal,
  ): Promise<RequeueWinnerResult> {
    return this.runWorkflow<RequeueWinnerResult>(
      CONTENT_OPTIMIZATION_WORKFLOW_IDS.REQUEUE_WINNER,
      {
        brandId,
        organizationId,
        winner,
      },
    );
  }

  private async performRequeueWinnerIntoTrends(
    organizationId: string,
    brandId: string | undefined,
    winner: WinnerContentSignal,
  ): Promise<RequeueWinnerResult> {
    const caller = `${this.logContext}.requeueWinnerIntoTrends`;

    const preferences = await this.trendPreferencesService.getPreferences(
      organizationId,
      brandId,
    );

    if (preferences?.autoRequeueWinners === false) {
      this.logger.log(`${caller} skipped — opted out`, {
        brandId,
        contentRunId: winner.contentRunId,
      });
      return {
        reason: 'winner_trend_enrichment_disabled',
        requeued: false,
      };
    }

    const signals = this.deriveWinnerTrendSignals(winner);

    if (signals.keywords.length === 0 && signals.platforms.length === 0) {
      this.logger.log(`${caller} skipped — no usable trend signal`, {
        brandId,
        contentRunId: winner.contentRunId,
      });
      return { reason: 'no_signal', requeued: false };
    }

    const updated = await this.trendPreferencesService.mergeWinnerSignals(
      organizationId,
      brandId,
      signals,
    );

    this.logger.log(caller, {
      addedKeywords: signals.keywords,
      addedPlatforms: signals.platforms,
      brandId,
      contentRunId: winner.contentRunId,
    });

    return {
      addedKeywords: signals.keywords,
      addedPlatforms: signals.platforms,
      requeued: true,
      trendPreferencesId: updated.id,
    };
  }

  private async runWorkflow<T>(
    canonicalId: string,
    request: Record<string, unknown>,
  ): Promise<T> {
    const organizationId = this.requiredString(
      request.organizationId,
      'organizationId',
    );
    const { result } = await this.workflowRunner.runWorkflow<T>({
      actionType: canonicalId,
      canonicalId,
      inputValues: { request },
      organizationId,
      source: `ContentOptimizationService.${canonicalId}`,
    });
    return result;
  }

  private async loadSummaryAction(
    action: SystemWorkflowActionRequest,
  ): Promise<WeeklySummary> {
    const request = this.readActionRequest(action);
    const options = this.readOptions(request.options);
    return this.performanceSummaryService.getWeeklySummary(
      this.requiredString(request.organizationId, 'organizationId'),
      this.requiredString(request.brandId, 'brandId'),
      {
        endDate: options.endDate,
        startDate: options.startDate,
        topN: options.topN ?? 10,
      },
    );
  }

  private async runCycleAction(
    action: SystemWorkflowActionRequest,
  ): Promise<OptimizationCycleResult> {
    const request = this.readActionRequest(action);
    const options = this.readOptions(request.options);
    return this.optimizationCycleService.runOptimizationCycle(
      this.requiredString(request.organizationId, 'organizationId'),
      this.requiredString(request.brandId, 'brandId'),
      {
        ...(options.endDate ? { endDate: options.endDate } : {}),
        ...(options.startDate ? { startDate: options.startDate } : {}),
        topN: options.topN ?? 10,
      },
    );
  }

  private deriveAnalysisAction(
    action: SystemWorkflowActionRequest,
  ): PerformanceAnalysis {
    const summary = this.readSummary(action.input.summary);
    const optimizationCycle = this.readCycle(action.input.cycle);
    return {
      insights: this.deriveInsights(summary, optimizationCycle),
      optimizationCycle,
      summary,
    };
  }

  private async loadPromptContextAction(
    action: SystemWorkflowActionRequest,
  ): Promise<{
    performanceContext: string;
    topPerformers: PerformanceContentItem[];
    worstPerformers: PerformanceContentItem[];
  }> {
    const request = this.readActionRequest(action);
    const organizationId = this.requiredString(
      request.organizationId,
      'organizationId',
    );
    const brandId = this.requiredString(request.brandId, 'brandId');
    const [topPerformers, worstPerformers, performanceContext] =
      await Promise.all([
        this.performanceSummaryService.getTopPerformers(
          organizationId,
          brandId,
          5,
        ),
        this.performanceSummaryService.getWorstPerformers(
          organizationId,
          brandId,
          5,
        ),
        this.performanceSummaryService.generatePerformanceContext(
          organizationId,
          brandId,
        ),
      ]);
    return { performanceContext, topPerformers, worstPerformers };
  }

  private async optimizePromptAction(
    action: SystemWorkflowActionRequest,
  ): Promise<PromptOptimizationResult> {
    const request = this.readActionRequest(action);
    const originalPrompt = this.requiredString(
      request.originalPrompt,
      'originalPrompt',
    );
    const performance = this.readRecord(
      action.input.performance,
      'performance',
    );
    const topPerformers = this.readPerformers(
      performance.topPerformers,
      'topPerformers',
    );
    const worstPerformers = this.readPerformers(
      performance.worstPerformers,
      'worstPerformers',
    );
    const systemPrompt = this.buildOptimizationSystemPrompt(
      topPerformers,
      worstPerformers,
      this.requiredString(performance.performanceContext, 'performanceContext'),
    );
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
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Prompt optimization action returned no content');
    }
    return this.parseOptimizationResponse(content);
  }

  private async deriveRecommendationsAction(
    action: SystemWorkflowActionRequest,
  ): Promise<OptimizationRecommendations> {
    const summary = this.readSummary(action.input.summary);
    const optimizationCycle = this.readCycle(action.input.cycle);
    const postingSchedule = summary.avgEngagementByPlatform.map((platform) => {
      const bestHours = summary.bestPostingTimes
        .filter((time) => time.postCount >= 2)
        .sort((left, right) => right.avgEngagementRate - left.avgEngagementRate)
        .slice(0, 3)
        .map((time) => time.hour);
      return {
        bestHours: bestHours.length > 0 ? bestHours : [9, 12, 18],
        platform: platform.platform,
      };
    });
    const contentTypes = summary.avgEngagementByContentType.map((content) => ({
      avgEngagement: content.avgEngagementRate,
      recommendation:
        content.avgEngagementRate > 5
          ? `${content.category} content performs well — increase production`
          : content.avgEngagementRate > 2
            ? `${content.category} content is average — experiment with variations`
            : `${content.category} content underperforms — consider reducing or pivoting`,
      type: content.category,
    }));
    const general: ContentRecommendation[] =
      optimizationCycle.recommendations.map((recommendation) => ({
        basedOnDataPoints: recommendation.basedOn,
        category: recommendation.category,
        priority:
          recommendation.confidence > 0.7
            ? 'high'
            : recommendation.confidence > 0.4
              ? 'medium'
              : 'low',
        recommendation: recommendation.recommendation,
      }));
    const validatedAbTests = this.readAbTestOutcomes(
      action.input.validatedAbTests,
    );
    return {
      abTestSuggestions: this.deriveAbTestSuggestions(
        summary,
        optimizationCycle,
      ),
      contentTypes,
      general,
      pipelineConfigs: this.derivePipelineConfigs(summary),
      postingSchedule,
      validatedAbTests,
    };
  }

  private async generateSuggestionsAction(
    action: SystemWorkflowActionRequest,
  ): Promise<OptimizationSuggestion[]> {
    const request = this.readActionRequest(action);
    return this.performGenerateSuggestions(
      this.requiredString(request.organizationId, 'organizationId'),
      this.requiredString(request.brandId, 'brandId'),
    );
  }

  private async applySuggestionAction(
    action: SystemWorkflowActionRequest,
  ): Promise<AutoApplyResult> {
    const request = this.readActionRequest(action);
    const suggestions = this.readSuggestions(action.input.suggestions);
    return this.performApplySuggestion(
      this.requiredString(request.organizationId, 'organizationId'),
      this.requiredString(request.brandId, 'brandId'),
      this.requiredString(request.suggestionId, 'suggestionId'),
      suggestions,
    );
  }

  private async requeueWinnerAction(
    action: SystemWorkflowActionRequest,
  ): Promise<RequeueWinnerResult> {
    const request = this.readActionRequest(action);
    const brandId = this.optionalString(request.brandId);
    return this.performRequeueWinnerIntoTrends(
      this.requiredString(request.organizationId, 'organizationId'),
      brandId,
      this.readWinner(request.winner),
    );
  }

  private readActionRequest(
    action: SystemWorkflowActionRequest,
  ): Record<string, unknown> {
    return this.readRecord(action.input.request, 'request');
  }

  private readOptions(value: unknown): AnalyzePerformanceOptions {
    if (value === undefined) {
      return {};
    }
    const options = this.readRecord(value, 'options');
    return {
      ...(typeof options.endDate === 'string'
        ? { endDate: options.endDate }
        : {}),
      ...(typeof options.startDate === 'string'
        ? { startDate: options.startDate }
        : {}),
      ...(typeof options.topN === 'number' && Number.isFinite(options.topN)
        ? { topN: options.topN }
        : {}),
    };
  }

  private readSummary(value: unknown): WeeklySummary {
    return this.readRecord(value, 'summary') as unknown as WeeklySummary;
  }

  private readCycle(value: unknown): OptimizationCycleResult {
    return this.readRecord(
      value,
      'cycle',
    ) as unknown as OptimizationCycleResult;
  }

  private readPerformers(
    value: unknown,
    field: string,
  ): PerformanceContentItem[] {
    if (!Array.isArray(value)) {
      throw new Error(`Content optimization workflow requires ${field}`);
    }
    return value as PerformanceContentItem[];
  }

  private readSuggestions(value: unknown): OptimizationSuggestion[] {
    if (!Array.isArray(value)) {
      throw new Error('Content optimization workflow requires suggestions');
    }
    return value as OptimizationSuggestion[];
  }

  private readAbTestOutcomes(value: unknown): AbTestOutcome[] {
    if (!Array.isArray(value)) {
      throw new Error(
        'Content optimization workflow requires validated A/B tests',
      );
    }
    return value as AbTestOutcome[];
  }

  private readWinner(value: unknown): WinnerContentSignal {
    const winner = this.readRecord(value, 'winner');
    return {
      ...(typeof winner.avgEngagementRate === 'number'
        ? { avgEngagementRate: winner.avgEngagementRate }
        : {}),
      ...(this.optionalString(winner.contentRunId)
        ? { contentRunId: this.optionalString(winner.contentRunId) }
        : {}),
      ...(this.optionalString(winner.format)
        ? { format: this.optionalString(winner.format) }
        : {}),
      ...(Array.isArray(winner.hashtags)
        ? {
            hashtags: winner.hashtags.filter(
              (item): item is string => typeof item === 'string',
            ),
          }
        : {}),
      ...(this.optionalString(winner.hook)
        ? { hook: this.optionalString(winner.hook) }
        : {}),
      ...(Array.isArray(winner.keywords)
        ? {
            keywords: winner.keywords.filter(
              (item): item is string => typeof item === 'string',
            ),
          }
        : {}),
      ...(this.optionalString(winner.platform)
        ? { platform: this.optionalString(winner.platform) }
        : {}),
      variantId: this.requiredString(winner.variantId, 'variantId'),
    };
  }

  private readRecord(value: unknown, field: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Content optimization workflow requires ${field}`);
    }
    return value as Record<string, unknown>;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private requiredString(value: unknown, field: string): string {
    const resolved = this.optionalString(value);
    if (!resolved) {
      throw new Error(`Content optimization workflow requires ${field}`);
    }
    return resolved;
  }

  private deriveWinnerTrendSignals(winner: WinnerContentSignal): {
    keywords: string[];
    hashtags: string[];
    platforms: string[];
    categories: string[];
  } {
    const platform = this.normalizeToken(winner.platform);
    const format = this.normalizeToken(winner.format);

    const keywords = [
      ...new Set(
        [
          ...this.tokenizeHook(winner.hook),
          ...(format ? [format] : []),
          ...(winner.keywords ?? []).map((keyword) =>
            this.normalizeToken(keyword),
          ),
        ].filter((token): token is string => token.length > 0),
      ),
    ].slice(0, MAX_WINNER_KEYWORDS);

    const hashtags = [
      ...new Set(
        (winner.hashtags ?? [])
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ];

    return {
      categories: [],
      hashtags,
      keywords,
      platforms: platform ? [platform] : [],
    };
  }

  private tokenizeHook(hook: string | undefined): string[] {
    if (!hook) {
      return [];
    }

    return hook
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (token) =>
          token.length >= 3 &&
          !HOOK_STOP_WORDS.has(token) &&
          !/^\d+$/.test(token),
      );
  }

  private normalizeToken(value: string | undefined): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  private toIsoDate(value: Date | string, field: string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Content optimization requires a valid ${field}`);
    }
    return date.toISOString();
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
    worstPerformers: PerformanceContentItem[],
    performanceContext: string,
  ): string {
    const topExamples = topPerformers
      .slice(0, 3)
      .map(
        (item) =>
          `- "${this.formatPerformerLabel(item)}" (engagement: ${item.engagementRate.toFixed(2)}%)`,
      )
      .join('\n');

    const antiPatterns = worstPerformers.slice(0, 3).map((item) => {
      const label = this.formatPerformerLabel(item);
      return `- Avoid repeating underperforming angle "${label}" (${item.engagementRate.toFixed(2)}% engagement).`;
    });

    const antiPatternSection =
      antiPatterns.length > 0
        ? `\n## Historical Anti-Patterns\n${antiPatterns.join('\n')}\n`
        : '\n';

    return `You are a content optimization AI. Analyze content performance data and improve prompts.

Performance context: ${performanceContext}

Top performing content:
${topExamples || 'No data yet.'}
${antiPatternSection}
Your job: take the user's content prompt and optimize it based on what has worked historically.
Return ONLY valid JSON.`;
  }

  private formatPerformerLabel(item: PerformanceContentItem): string {
    const rawLabel = item.title || item.description || item.postId;
    return SecurityUtil.sanitizePromptInput(rawLabel, 140);
  }

  private parseOptimizationResponse(content: string): PromptOptimizationResult {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Prompt optimization action returned no JSON object');
    }
    const parsed = this.readRecord(JSON.parse(jsonMatch[0]), 'LLM response');
    if (
      typeof parsed.confidenceScore !== 'number' ||
      !Number.isFinite(parsed.confidenceScore) ||
      parsed.confidenceScore < 0 ||
      parsed.confidenceScore > 1
    ) {
      throw new Error(
        'Prompt optimization action requires confidenceScore from 0 to 1',
      );
    }
    if (!Array.isArray(parsed.suggestions)) {
      throw new Error('Prompt optimization action requires suggestions');
    }
    return {
      confidenceScore: parsed.confidenceScore,
      optimizedPrompt: this.requiredString(
        parsed.optimizedPrompt,
        'optimizedPrompt',
      ),
      reasoning: this.requiredString(parsed.reasoning, 'reasoning'),
      suggestions: parsed.suggestions.map((suggestion, index) =>
        this.requiredString(suggestion, `suggestions[${index}]`),
      ),
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

  private async applySuggestionPayload(
    organizationId: string,
    brandId: string,
    suggestion: OptimizationSuggestion,
  ): Promise<boolean> {
    switch (suggestion.category) {
      case 'timing': {
        const preferredTime = this.readPayloadField(
          suggestion.payload,
          'preferredTime',
        );
        if (!preferredTime) {
          return false;
        }

        await this.brandMemoryService.updateMetrics(organizationId, brandId, {
          topPerformingTime: preferredTime,
        });
        return true;
      }
      case 'format': {
        const preferredFormat = this.readPayloadField(
          suggestion.payload,
          'preferredFormat',
        );
        if (!preferredFormat) {
          return false;
        }

        await this.brandMemoryService.updateMetrics(organizationId, brandId, {
          topPerformingFormat: preferredFormat,
        });
        return true;
      }
      case 'hook': {
        const hook = this.readPayloadField(suggestion.payload, 'hook');
        if (!hook) {
          return false;
        }

        const sanitizedHook = SecurityUtil.sanitizePromptInput(hook);
        if (!sanitizedHook) {
          return false;
        }

        await this.brandMemoryService.logEntry(organizationId, brandId, {
          content: sanitizedHook,
          metadata: {
            suggestionId: suggestion.id,
            source: 'optimization_auto_apply',
          },
          type: 'hook',
        });
        return true;
      }
      default:
        return false;
    }
  }

  private readPayloadField(
    payload: OptimizationSuggestionPayload,
    key: 'preferredTime' | 'preferredFormat' | 'hook',
  ): string | null {
    const value =
      key === 'preferredTime' && 'preferredTime' in payload
        ? payload.preferredTime
        : key === 'preferredFormat' && 'preferredFormat' in payload
          ? payload.preferredFormat
          : key === 'hook' && 'hook' in payload
            ? payload.hook
            : null;

    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
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
