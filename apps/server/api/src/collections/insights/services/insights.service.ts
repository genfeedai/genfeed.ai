import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { GetForecastDto } from '@api/collections/insights/dto/forecast.dto';
import { PredictViralDto } from '@api/collections/insights/dto/predict-viral.dto';
import type { ForecastDocument } from '@api/collections/insights/schemas/forecast.schema';
import type { InsightDocument } from '@api/collections/insights/schemas/insight.schema';
import {
  buildInsightGenerationWorkflowDefinition,
  INSIGHT_GENERATION_ACTION_IDS,
} from '@api/collections/insights/services/insight-generation-workflow-definition';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { scopedWhere } from '@api/index';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Timeframe } from '@genfeedai/contracts';
import {
  CONTENT_GAP_ANALYSIS_SCHEMA_NAME,
  contentGapAnalysisSchema,
  GENERATED_INSIGHTS_SCHEMA_NAME,
  generatedInsightsSchema,
  INSIGHT_POSTING_TIMES_SCHEMA_NAME,
  insightPostingTimesSchema,
  VIRAL_PREDICTION_SCHEMA_NAME,
  viralPredictionSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { InsightGenerationWorkflowInput } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ZodType } from 'zod';

/** Brands whose performance grounds an organisation-level insight prompt. */
const INSIGHT_GROUNDING_BRAND_LIMIT = 3;

type Forecast = ForecastDocument;
type Insight = InsightDocument;
const INSIGHTS_TEXT_MODEL = LLM_DEFAULTS.planning;

type InsightData = {
  actionableSteps?: string[];
  category?: string;
  confidence?: number;
  description?: string;
  expiresAt?: string | null;
  impact?: string;
  isDismissed?: boolean;
  isRead?: boolean;
  relatedMetrics?: string[];
  title?: string;
};

type InsightGenerationPlan = {
  existingIds: string[];
  missingCount: number;
  organizationId: string;
};

type PersistedInsightGeneration = {
  insightIds: string[];
  persisted: number;
};

type ForecastData = {
  metric?: string;
  period?: string;
  validUntil?: string;
  data?: unknown;
};

@Injectable()
export class InsightsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    @Optional()
    private readonly performanceSummaryService?: PerformanceSummaryService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      INSIGHT_GENERATION_ACTION_IDS.LOAD,
      ({ input }) =>
        this.loadInsightGenerationContext(
          input.request as InsightGenerationWorkflowInput,
        ),
    );
    this.workflowRunner.registerAction(
      INSIGHT_GENERATION_ACTION_IDS.GENERATE,
      ({ input }) =>
        this.generateInsightDrafts(input.plan as InsightGenerationPlan),
    );
    this.workflowRunner.registerAction(
      INSIGHT_GENERATION_ACTION_IDS.PERSIST,
      ({ input }) =>
        this.persistGeneratedInsights(
          input.plan as InsightGenerationPlan,
          input.generated as { drafts?: InsightData[] },
        ),
    );
    this.workflowRunner.registerWorkflow(
      buildInsightGenerationWorkflowDefinition(),
    );
  }

  private capInsightLimit(limit: number): number {
    return Math.min(Math.max(limit, 1), 50);
  }

  private activeInsightFilters(now: Date) {
    return {
      isDismissed: false,
      isRead: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
  }

  private toInsightDocument(row: {
    category?: string | null;
    data: unknown;
    expiresAt?: Date | null;
    isDismissed: boolean;
    isRead: boolean;
  }): Insight {
    const data = this.readObjectRecord(row.data);

    return {
      ...row,
      ...data,
      category: row.category ?? this.readString(data.category),
      data,
      expiresAt: row.expiresAt ?? data.expiresAt,
      isDismissed: row.isDismissed,
      isRead: row.isRead,
    } as unknown as Insight;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  async getForecast(
    dto: GetForecastDto,
    organizationId: string,
  ): Promise<Forecast[]> {
    this.logger.debug('Generating forecasts', {
      metrics: dto.metrics,
      organizationId,
      period: dto.period,
    });

    const forecasts: Forecast[] = [];

    const now = new Date();
    const allForecasts = await this.prisma.forecast.findMany({
      where: scopedWhere(organizationId, {
        AND: [
          {
            OR: dto.metrics.map((metric) => ({
              data: { equals: metric, path: ['metric'] },
            })),
          },
          { data: { equals: dto.period, path: ['period'] } },
          { data: { gt: now.toISOString(), path: ['validUntil'] } },
        ],
      }),
    });

    const validForecastsByMetric = new Map<
      string,
      (typeof allForecasts)[number]
    >();
    for (const candidate of allForecasts) {
      const data = candidate.data as ForecastData;

      if (typeof data?.metric !== 'string') {
        continue;
      }

      // `.find()` returned the first match, so keep the first row per metric.
      if (!validForecastsByMetric.has(data.metric)) {
        validForecastsByMetric.set(data.metric, candidate);
      }
    }

    for (const metric of dto.metrics) {
      const existingForecast = validForecastsByMetric.get(metric);

      if (existingForecast) {
        forecasts.push(existingForecast as unknown as Forecast);
        continue;
      }

      const forecast = await this.generateForecast(
        metric,
        dto.period,
        organizationId,
      );
      forecasts.push(forecast);
    }

    return forecasts;
  }

  async getInsights(
    organizationId: string,
    limit: number = 5,
  ): Promise<Insight[]> {
    try {
      const cappedLimit = this.capInsightLimit(limit);
      this.logger.debug('Getting insights', {
        limit: cappedLimit,
        organizationId,
      });

      const rows = await this.prisma.insight.findMany({
        orderBy: { createdAt: 'desc' },
        take: cappedLimit,
        where: scopedWhere(
          organizationId,
          this.activeInsightFilters(new Date()),
        ),
      });

      return rows.map((row) => this.toInsightDocument(row));
    } catch (error: unknown) {
      this.logger.error('Failed to get insights', { error });
      throw error;
    }
  }

  async enqueueInsightGenerationIfNeeded(
    organizationId: string,
    limit: number = 5,
  ): Promise<void> {
    if (!(await this.needsInsightGeneration(organizationId, limit))) {
      return;
    }

    const request: InsightGenerationWorkflowInput = {
      limit: this.capInsightLimit(limit),
      organizationId,
    };
    const definition = buildInsightGenerationWorkflowDefinition();
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId,
        source: 'insights-fill',
      },
      `insight-generate-${organizationId}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  async needsInsightGeneration(
    organizationId: string,
    limit: number = 5,
  ): Promise<boolean> {
    const cappedLimit = this.capInsightLimit(limit);
    const activeCount = await this.prisma.insight.count({
      where: scopedWhere(organizationId, this.activeInsightFilters(new Date())),
    });

    return activeCount < cappedLimit;
  }

  private async loadInsightGenerationContext(
    request: InsightGenerationWorkflowInput,
  ): Promise<InsightGenerationPlan> {
    const limit = this.capInsightLimit(request.limit);
    const existing = await this.prisma.insight.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      take: limit,
      where: scopedWhere(
        request.organizationId,
        this.activeInsightFilters(new Date()),
      ),
    });
    return {
      existingIds: existing.map(({ id }) => id),
      missingCount: Math.max(0, limit - existing.length),
      organizationId: request.organizationId,
    };
  }

  /**
   * Consolidated update behind `PATCH /insights/:id`. Merges the `isRead` /
   * `isDismissed` flags into the insight's `data` JSON blob, preserving other
   * keys. Replaces the former read/dismiss action routes.
   */
  @HandleErrors('update insight', 'insights')
  async update(
    insightId: string,
    organizationId: string,
    dto: { isDismissed?: boolean; isRead?: boolean },
  ): Promise<Insight> {
    try {
      this.logger.debug('Updating insight', { insightId, organizationId });

      const existing = await this.prisma.insight.findFirst({
        where: scopedWhere(organizationId, { id: insightId }),
      });

      if (!existing) throw new Error('Insight not found');

      const data = (existing.data as InsightData) ?? {};
      const insight = await this.prisma.insight.update({
        where: scopedWhere(organizationId, { id: insightId }),
        data: {
          data: {
            ...data,
            ...(dto.isRead !== undefined ? { isRead: dto.isRead } : {}),
            ...(dto.isDismissed !== undefined
              ? { isDismissed: dto.isDismissed }
              : {}),
          },
          ...(dto.isRead !== undefined ? { isRead: dto.isRead } : {}),
          ...(dto.isDismissed !== undefined
            ? { isDismissed: dto.isDismissed }
            : {}),
        },
      });

      return this.toInsightDocument(insight);
    } catch (error: unknown) {
      this.logger.error('Failed to update insight', { error, insightId });
      throw error;
    }
  }

  private static readonly MAX_VIRAL_CONTENT_LENGTH = 50_000;

  async predictViral(
    dto: PredictViralDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    score: number;
    probability: number;
    estimatedReach: { min: number; max: number };
    factors: Array<{ factor: string; impact: number; description: string }>;
    recommendations: string[];
  }> {
    if (
      dto.content &&
      dto.content.length > InsightsService.MAX_VIRAL_CONTENT_LENGTH
    ) {
      throw new BadRequestException(
        `Content exceeds maximum allowed length of ${InsightsService.MAX_VIRAL_CONTENT_LENGTH} characters`,
      );
    }

    try {
      this.logger.debug('Predicting viral potential', {
        contentType: dto.contentType,
        organizationId,
        platform: dto.platform,
      });

      const platformText = dto.platform ? ` on ${dto.platform}` : '';

      const prompt = `Analyze the viral potential of this ${dto.contentType}${platformText}.

Content: "${dto.content}"

Score 0-100 for viral potential. Probability is the % chance of going viral
(>100k views). Estimate the reach range, name the factors driving the score
with the weight each carries, and give concrete recommendations.`;

      return await this.completeStructured(
        prompt,
        1024,
        viralPredictionSchema,
        VIRAL_PREDICTION_SCHEMA_NAME,
        organizationId,
        onBilling,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to predict viral potential', { error });
      throw error;
    }
  }

  async getContentGaps(
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    missingTopics: string[];
    opportunityAreas: Array<{
      area: string;
      potential: number;
      competition: string;
      recommendations: string[];
    }>;
    underservedAudiences: string[];
  }> {
    try {
      this.logger.debug('Analyzing content gaps', { organizationId });

      const prompt = `Analyze content gaps for a content creator.

List the topics they are missing, the opportunity areas — each with a 0-100
potential, the competition level and concrete recommendations — and the
audiences currently underserved.`;

      return await this.completeStructured(
        prompt,
        1024,
        contentGapAnalysisSchema,
        CONTENT_GAP_ANALYSIS_SCHEMA_NAME,
        organizationId,
        onBilling,
      );
    } catch (error: unknown) {
      this.logger.error('Failed to analyze content gaps', { error });
      throw error;
    }
  }

  async getBestTimes(
    platform: string,
    timezone: string = 'UTC',
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    recommendedTimes: Array<{
      day: string;
      time: string;
      confidence: number;
      reason: string;
    }>;
    timezone: string;
  }> {
    try {
      this.logger.debug('Getting best posting times', {
        organizationId,
        platform,
        timezone,
      });

      const grounding = await this.buildPerformanceGrounding(organizationId);
      const prompt = `Based on ${platform} best practices and audience engagement patterns, provide the best posting times in ${timezone} timezone.
${grounding}
Provide 5-7 optimal time slots, each with a day, a time like "09:00 AM", a
0-100 confidence and the reason it works.`;

      const result = await this.completeStructured(
        prompt,
        1024,
        insightPostingTimesSchema,
        INSIGHT_POSTING_TIMES_SCHEMA_NAME,
        organizationId,
        onBilling,
      );

      return { recommendedTimes: result.recommendedTimes, timezone };
    } catch (error: unknown) {
      this.logger.error('Failed to get best posting times', { error });
      throw error;
    }
  }

  async getGrowthPrediction(
    platform: string,
    organizationId: string,
  ): Promise<{
    currentFollowers: number;
    predictedGrowth: {
      [Timeframe.D30]: number;
      '60d': number;
      [Timeframe.D90]: number;
    };
    growthRate: number;
    trend: 'accelerating' | 'steady' | 'slowing';
    recommendations: string[];
  }> {
    try {
      this.logger.debug('Predicting growth', { organizationId, platform });

      throw new Error(
        `Insufficient data: real follower count for platform "${platform}" in organization "${organizationId}" is not available. ` +
          'Integrate AnalyticsSyncService or ContentPerformanceService to fetch actual follower data before using growth predictions.',
      );
    } catch (error: unknown) {
      this.logger.error('Failed to predict growth', { error });
      throw error;
    }
  }

  private async generateForecast(
    metric: string,
    _period: string,
    organizationId: string,
  ): Promise<Forecast> {
    throw new Error(
      `Insufficient data: real value for metric "${metric}" in organization "${organizationId}" is not available. ` +
        'Integrate AnalyticsSyncService or ContentPerformanceService to fetch actual metric data before using forecasts.',
    );
  }

  /**
   * Real performance context for the organisation's active brands — Genfeed
   * posts plus posts imported from connected accounts — so insight and timing
   * prompts reason from what the brand actually published instead of generic
   * best practices. Empty when nothing is available.
   */
  private async buildPerformanceGrounding(
    organizationId: string,
  ): Promise<string> {
    if (!this.performanceSummaryService) {
      return '';
    }
    const brands = await this.prisma.brand.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, label: true },
      take: INSIGHT_GROUNDING_BRAND_LIMIT,
      where: scopedWhere(organizationId, { isActive: true }),
    });
    const lines: string[] = [];
    for (const brand of brands) {
      try {
        const context =
          await this.performanceSummaryService.generatePerformanceContext(
            organizationId,
            brand.id,
          );
        if (context && !context.startsWith('No performance data')) {
          lines.push(`- ${brand.label}: ${context}`);
        }
      } catch (error: unknown) {
        this.logger.warn('Insight grounding skipped brand performance', {
          brandId: brand.id,
          error: (error as Error)?.message,
        });
      }
    }
    if (lines.length === 0) {
      return '';
    }
    return `\nGround every insight in this recent performance data (last 7 days, Genfeed posts plus posts imported from connected social accounts):\n${lines.join('\n')}\n`;
  }

  private async generateInsightDrafts(
    plan: InsightGenerationPlan,
  ): Promise<{ drafts: InsightData[] }> {
    if (plan.missingCount === 0) return { drafts: [] };
    const grounding = await this.buildPerformanceGrounding(plan.organizationId);
    const prompt = `Generate ${plan.missingCount} actionable insights for a content creator.
${grounding}
Give each insight a type (trend, opportunity, warning or tip), a title, a
description, an impact of high, medium or low, a 0-100 confidence, the steps
to act on it, and the metrics it relates to.`;

    const result = await this.completeStructured(
      prompt,
      2048,
      generatedInsightsSchema,
      GENERATED_INSIGHTS_SCHEMA_NAME,
      plan.organizationId,
    );

    return {
      drafts: result.insights.map((insight) => ({
        actionableSteps: insight.actionableSteps,
        category: insight.type,
        confidence: insight.confidence,
        description: insight.description,
        impact: insight.impact,
        isDismissed: false,
        isRead: false,
        relatedMetrics: insight.relatedMetrics,
        title: insight.title,
      })),
    };
  }

  private async persistGeneratedInsights(
    plan: InsightGenerationPlan,
    generated: { drafts?: InsightData[] },
  ): Promise<PersistedInsightGeneration> {
    const savedInsightIds: string[] = [];
    for (const insightData of generated.drafts ?? []) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const payload = {
        ...insightData,
        expiresAt: expiresAt.toISOString(),
        isDismissed: false,
        isRead: false,
      } satisfies InsightData;

      const insight = await this.prisma.insight.create({
        data: {
          category: payload.category,
          data: payload,
          expiresAt,
          isDismissed: false,
          isRead: false,
          organizationId: plan.organizationId,
        },
      });

      savedInsightIds.push(insight.id);
    }

    return {
      insightIds: [...plan.existingIds, ...savedInsightIds],
      persisted: savedInsightIds.length,
    };
  }

  /**
   * One schema-enforced insight completion.
   *
   * A provider that is down is still a 503 the caller can retry; output that
   * misses its schema twice is not — that is the model's answer, and
   * `LlmStructuredOutputError` says which fields were wrong rather than
   * pretending the vendor is unavailable.
   */
  private async completeStructured<TResult>(
    prompt: string,
    maxTokens: number,
    schema: ZodType<TResult>,
    schemaName: string,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<TResult> {
    try {
      return await this.llmDispatcherService.completeStructured(
        {
          max_tokens: maxTokens,
          messages: [{ content: prompt, role: 'user' }],
          model: INSIGHTS_TEXT_MODEL,
          onAttempt: async (response) => {
            onBilling?.(
              await this.calculateDefaultTextCharge(
                { max_completion_tokens: maxTokens, prompt },
                response.choices?.[0]?.message?.content ?? '',
              ),
            );
          },
          schema,
          schemaName,
          temperature: 0.2,
        },
        organizationId,
      );
    } catch (error: unknown) {
      if (error instanceof LlmStructuredOutputError) {
        throw error;
      }

      this.logger.warn('Insight generation provider unavailable', {
        organizationId,
        providerStatus: 'unavailable',
      });
      throw new ServiceUnavailableException(
        'Analytics insight generation is temporarily unavailable',
      );
    }
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return calculateEstimatedTextCredits(model, input, output);
  }
}
