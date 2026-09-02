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
import { JsonParserUtil } from '@api/helpers/utils/json-parser.util';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { scopedWhere } from '@api/index';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Timeframe } from '@genfeedai/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { InsightGenerationWorkflowInput } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';

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

  private readObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private readEstimatedReach(value: unknown): { min: number; max: number } {
    const record = this.readObjectRecord(value);

    return {
      max: this.readNumber(record.max) ?? 0,
      min: this.readNumber(record.min) ?? 0,
    };
  }

  private readFactors(
    value: unknown,
  ): Array<{ factor: string; impact: number; description: string }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      const record = this.readObjectRecord(item);
      const factor = this.readString(record.factor);
      const description = this.readString(record.description);

      if (!factor || !description) {
        return [];
      }

      return [
        {
          description,
          factor,
          impact: this.readNumber(record.impact) ?? 0,
        },
      ];
    });
  }

  private readOpportunityAreas(value: unknown): Array<{
    area: string;
    potential: number;
    competition: string;
    recommendations: string[];
  }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      const record = this.readObjectRecord(item);
      const area = this.readString(record.area);
      const competition = this.readString(record.competition);

      if (!area || !competition) {
        return [];
      }

      return [
        {
          area,
          competition,
          potential: this.readNumber(record.potential) ?? 0,
          recommendations: this.readStringArray(record.recommendations),
        },
      ];
    });
  }

  private readRecommendedTimes(value: unknown): Array<{
    day: string;
    time: string;
    confidence: number;
    reason: string;
  }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      const record = this.readObjectRecord(item);
      const day = this.readString(record.day);
      const time = this.readString(record.time);
      const reason = this.readString(record.reason);

      if (!day || !time || !reason) {
        return [];
      }

      return [
        {
          confidence: this.readNumber(record.confidence) ?? 0,
          day,
          reason,
          time,
        },
      ];
    });
  }

  @HandleErrors('get forecast', 'insights')
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

Return JSON:
{
  "score": 75,
  "probability": 12,
  "estimatedReach": { "min": 10000, "max": 50000 },
  "factors": [
    {
      "factor": "Strong hook",
      "impact": 25,
      "description": "Opening line grabs attention immediately"
    }
  ],
  "recommendations": [
    "Add trending hashtags for broader reach",
    "Post during peak engagement hours (2-4 PM)"
  ]
}

Score 0-100 for viral potential.
Probability is % chance of going viral (>100k views).

Return ONLY valid JSON. Do not include any text before or after the JSON.`;

      const input = { max_completion_tokens: 1024, prompt };
      const response = await this.generateTextCompletion(
        prompt,
        input.max_completion_tokens,
        organizationId,
      );
      onBilling?.(await this.calculateDefaultTextCharge(input, response));

      const result = JsonParserUtil.parseAIResponse<Record<string, unknown>>(
        response,
        {},
      );

      return {
        estimatedReach: this.readEstimatedReach(result.estimatedReach),
        factors: this.readFactors(result.factors),
        probability: this.readNumber(result.probability) ?? 0,
        recommendations: this.readStringArray(result.recommendations),
        score: this.readNumber(result.score) ?? 0,
      };
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

Return ONLY valid JSON with this structure. Do not include any text before or after the JSON:
{
  "missingTopics": ["Behind-the-scenes", "Product tutorials"],
  "opportunityAreas": [
    {
      "area": "Educational content",
      "potential": 85,
      "competition": "medium",
      "recommendations": ["Create how-to guides", "Share expert tips"]
    }
  ],
  "underservedAudiences": ["Beginners in your niche", "Advanced users"]
}`;

      const input = { max_completion_tokens: 1024, prompt };
      const response = await this.generateTextCompletion(
        prompt,
        input.max_completion_tokens,
        organizationId,
      );
      onBilling?.(await this.calculateDefaultTextCharge(input, response));

      const result = JsonParserUtil.parseAIResponse<Record<string, unknown>>(
        response,
        {},
      );

      return {
        missingTopics: this.readStringArray(result.missingTopics),
        opportunityAreas: this.readOpportunityAreas(result.opportunityAreas),
        underservedAudiences: this.readStringArray(result.underservedAudiences),
      };
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

      const prompt = `Based on ${platform} best practices and audience engagement patterns, provide the best posting times in ${timezone} timezone.

Return ONLY valid JSON with this structure. Do not include any text before or after the JSON:
{
  "recommendedTimes": [
    {
      "day": "Monday",
      "time": "09:00 AM",
      "confidence": 85,
      "reason": "Peak morning engagement for professionals"
    }
  ]
}

Provide 5-7 optimal time slots.`;

      const input = { max_completion_tokens: 1024, prompt };
      const response = await this.generateTextCompletion(
        prompt,
        input.max_completion_tokens,
        organizationId,
      );
      onBilling?.(await this.calculateDefaultTextCharge(input, response));

      const result = JsonParserUtil.parseAIResponse<Record<string, unknown>>(
        response,
        {},
      );

      return {
        recommendedTimes: this.readRecommendedTimes(result.recommendedTimes),
        timezone,
      };
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

  private async generateInsightDrafts(
    plan: InsightGenerationPlan,
  ): Promise<{ drafts: InsightData[] }> {
    if (plan.missingCount === 0) return { drafts: [] };
    const prompt = `Generate ${plan.missingCount} actionable insights for a content creator.

Return ONLY valid JSON with this structure. Do not include any text before or after the JSON:
{
  "insights": [
    {
      "type": "opportunity",
      "title": "Leverage trending audio",
      "description": "Your niche has 3 trending audio tracks with 10M+ uses",
      "impact": "high",
      "confidence": 85,
      "actionableSteps": [
        "Create content using trending audio #1",
        "Post within next 48 hours while trending"
      ],
      "relatedMetrics": ["engagement", "reach"]
    }
  ]
}

Types: trend, opportunity, warning, tip
Impact: high, medium, low
Confidence: 0-100`;

    const input = { max_completion_tokens: 2048, prompt };
    const response = await this.generateTextCompletion(
      prompt,
      input.max_completion_tokens,
      plan.organizationId,
    );

    const result = JsonParserUtil.parseAIResponse<Record<string, unknown>>(
      response,
      { insights: [] },
    );
    const insights = (result.insights as Record<string, unknown>[]) || [];
    return {
      drafts: insights.map((insightData) => ({
        actionableSteps: (insightData.actionableSteps as string[]) || [],
        category: insightData.type as string,
        confidence: insightData.confidence as number,
        description: insightData.description as string,
        impact: insightData.impact as string,
        isDismissed: false,
        isRead: false,
        relatedMetrics: (insightData.relatedMetrics as string[]) || [],
        title: insightData.title as string,
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

  private async generateTextCompletion(
    prompt: string,
    maxTokens: number,
    organizationId: string,
  ): Promise<string> {
    try {
      const response = await this.llmDispatcherService.chatCompletion(
        {
          max_tokens: maxTokens,
          messages: [{ content: prompt, role: 'user' }],
          model: INSIGHTS_TEXT_MODEL,
          temperature: 0.2,
        },
        organizationId,
      );

      return response.choices?.[0]?.message?.content?.trim() ?? '';
    } catch {
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
