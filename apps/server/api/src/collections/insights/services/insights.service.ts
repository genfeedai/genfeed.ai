import { GetForecastDto } from '@api/collections/insights/dto/forecast.dto';
import { PredictViralDto } from '@api/collections/insights/dto/predict-viral.dto';
import type { ForecastDocument } from '@api/collections/insights/schemas/forecast.schema';
import type { InsightDocument } from '@api/collections/insights/schemas/insight.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { JsonParserUtil } from '@api/helpers/utils/json-parser.util';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Timeframe } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type Forecast = ForecastDocument;
type Insight = InsightDocument;

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

type ForecastData = {
  metric?: string;
  period?: string;
  validUntil?: string;
  data?: unknown;
};

@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {}

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

    for (const metric of dto.metrics) {
      // Check for recent forecast in data JSON
      const allForecasts = await this.prisma.forecast.findMany({
        where: { isDeleted: false, organizationId },
      });

      const existingForecast = allForecasts.find((f) => {
        const data = f.data as ForecastData;
        return (
          data?.metric === metric &&
          data?.period === dto.period &&
          data?.validUntil &&
          new Date(data.validUntil) > new Date()
        );
      });

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
    onBilling?: (amount: number) => void,
  ): Promise<Insight[]> {
    try {
      this.logger.debug('Getting insights', { limit, organizationId });

      const allInsights = await this.prisma.insight.findMany({
        where: { isDeleted: false, organizationId },
        orderBy: { createdAt: 'desc' },
      });

      const now = new Date();
      const existingInsights = allInsights
        .filter((i) => {
          const data = i.data as InsightData;
          if (data?.isRead || data?.isDismissed) return false;
          if (data?.expiresAt && new Date(data.expiresAt) <= now) return false;
          return true;
        })
        .slice(0, limit);

      if (existingInsights.length >= limit) {
        return existingInsights as unknown as Insight[];
      }

      const newInsights = await this.generateInsights(
        organizationId,
        limit - existingInsights.length,
        onBilling,
      );

      return [...(existingInsights as unknown as Insight[]), ...newInsights];
    } catch (error: unknown) {
      this.logger.error('Failed to get insights', { error });
      throw error;
    }
  }

  async needsInsightGeneration(
    organizationId: string,
    limit: number = 5,
  ): Promise<boolean> {
    const allInsights = await this.prisma.insight.findMany({
      where: { isDeleted: false, organizationId },
    });

    const now = new Date();
    const active = allInsights.filter((i) => {
      const data = i.data as InsightData;
      if (data?.isRead || data?.isDismissed) return false;
      if (data?.expiresAt && new Date(data.expiresAt) <= now) return false;
      return true;
    });

    return active.length < limit;
  }

  @HandleErrors('mark insight as read', 'insights')
  async markAsRead(
    insightId: string,
    organizationId: string,
  ): Promise<Insight> {
    try {
      this.logger.debug('Marking insight as read', {
        insightId,
        organizationId,
      });

      const existing = await this.prisma.insight.findFirst({
        where: { id: insightId, isDeleted: false, organizationId },
      });

      if (!existing) throw new Error('Insight not found');

      const data = (existing.data as InsightData) ?? {};
      const insight = await this.prisma.insight.update({
        where: { id: insightId },
        data: { data: { ...data, isRead: true } },
      });

      return insight as unknown as Insight;
    } catch (error: unknown) {
      this.logger.error('Failed to mark insight as read', { error, insightId });
      throw error;
    }
  }

  @HandleErrors('mark insight as dismissed', 'insights')
  async markAsDismissed(
    insightId: string,
    organizationId: string,
  ): Promise<Insight> {
    try {
      this.logger.debug('Marking insight as dismissed', {
        insightId,
        organizationId,
      });

      const existing = await this.prisma.insight.findFirst({
        where: { id: insightId, isDeleted: false, organizationId },
      });

      if (!existing) throw new Error('Insight not found');

      const data = (existing.data as InsightData) ?? {};
      const insight = await this.prisma.insight.update({
        where: { id: insightId },
        data: { data: { ...data, isDismissed: true } },
      });

      return insight as unknown as Insight;
    } catch (error: unknown) {
      this.logger.error('Failed to mark insight as dismissed', {
        error,
        insightId,
      });
      throw error;
    }
  }

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
      const response = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
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
      const response = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
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
      const response = await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        input,
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

  private async generateInsights(
    organizationId: string,
    count: number,
    onBilling?: (amount: number) => void,
  ): Promise<Insight[]> {
    const prompt = `Generate ${count} actionable insights for a content creator.

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
    const response = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, response));

    const result = JsonParserUtil.parseAIResponse<Record<string, unknown>>(
      response,
      { insights: [] },
    );
    const insights = (result.insights as Record<string, unknown>[]) || [];

    const savedInsights: Insight[] = [];

    for (const insightData of insights) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const insight = await this.prisma.insight.create({
        data: {
          organizationId,
          data: {
            actionableSteps: (insightData.actionableSteps as string[]) || [],
            category: insightData.type as string,
            confidence: insightData.confidence as number,
            description: insightData.description as string,
            expiresAt: expiresAt.toISOString(),
            impact: insightData.impact as string,
            isDismissed: false,
            isRead: false,
            relatedMetrics: (insightData.relatedMetrics as string[]) || [],
            title: insightData.title as string,
          } satisfies InsightData,
        },
      });

      savedInsights.push(insight as unknown as Insight);
    }

    return savedInsights;
  }

  private async calculateDefaultTextCharge(
    input: Record<string, unknown>,
    output: string,
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      isDeleted: false,
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
