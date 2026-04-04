import { GetForecastDto } from '@api/collections/insights/dto/forecast.dto';
import { PredictViralDto } from '@api/collections/insights/dto/predict-viral.dto';
import {
  Forecast,
  type ForecastDocument,
} from '@api/collections/insights/schemas/forecast.schema';
import {
  Insight,
  type InsightDocument,
} from '@api/collections/insights/schemas/insight.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { JsonParserUtil } from '@api/helpers/utils/json-parser.util';
import { calculateEstimatedTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { Timeframe } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class InsightsService {
  constructor(
    @InjectModel(Forecast.name, DB_CONNECTIONS.ANALYTICS)
    private forecastModel: Model<ForecastDocument>,
    @InjectModel(Insight.name, DB_CONNECTIONS.ANALYTICS)
    private insightModel: Model<InsightDocument>,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
  ) {}

  /**
   * Get trend forecasts for metrics
   */
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
      // Check if we have a recent forecast (within 24 hours)
      const existingForecast = await this.forecastModel
        .findOne({
          isDeleted: false,
          metric,
          organization: organizationId,
          period: dto.period,
          validUntil: { $gt: new Date() },
        })
        .lean();

      if (existingForecast) {
        forecasts.push(existingForecast);
        continue;
      }

      // Generate new forecast with AI
      const forecast = await this.generateForecast(
        metric,
        dto.period,
        organizationId,
      );

      forecasts.push(forecast);
    }

    return forecasts;
  }

  /**
   * Get AI-generated insights
   */
  async getInsights(
    organizationId: string,
    limit: number = 5,
    onBilling?: (amount: number) => void,
  ): Promise<Insight[]> {
    try {
      this.logger.debug('Getting insights', { limit, organizationId });

      // Get recent unread insights
      const existingInsights = await this.insightModel
        .find({
          $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }],
          isDeleted: false,
          isDismissed: false,
          isRead: false,
          organization: organizationId,
        })
        .sort({ createdAt: -1, impact: -1 })
        .limit(limit)
        .lean();

      if (existingInsights.length >= limit) {
        return existingInsights;
      }

      // Generate new insights if needed
      const newInsights = await this.generateInsights(
        organizationId,
        limit - existingInsights.length,
        onBilling,
      );

      return [...existingInsights, ...newInsights];
    } catch (error: unknown) {
      this.logger.error('Failed to get insights', { error });
      throw error;
    }
  }

  async needsInsightGeneration(
    organizationId: string,
    limit: number = 5,
  ): Promise<boolean> {
    const existingInsights = await this.insightModel
      .find({
        $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }],
        isDeleted: false,
        isDismissed: false,
        isRead: false,
        organization: organizationId,
      })
      .limit(limit)
      .lean();

    return existingInsights.length < limit;
  }

  /**
   * Mark insight as read
   */
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

      const insight = await this.insightModel.findOneAndUpdate(
        {
          _id: insightId,
          isDeleted: false,
          organization: organizationId,
        },
        {
          isRead: true,
        },
        {
          returnDocument: 'after',
        },
      );

      if (!insight) {
        throw new Error('Insight not found');
      }

      return insight.toObject();
    } catch (error: unknown) {
      this.logger.error('Failed to mark insight as read', { error, insightId });
      throw error;
    }
  }

  /**
   * Mark insight as dismissed
   */
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

      const insight = await this.insightModel.findOneAndUpdate(
        {
          _id: insightId,
          isDeleted: false,
          organization: organizationId,
        },
        {
          isDismissed: true,
        },
        {
          returnDocument: 'after',
        },
      );

      if (!insight) {
        throw new Error('Insight not found');
      }

      return insight.toObject();
    } catch (error: unknown) {
      this.logger.error('Failed to mark insight as dismissed', {
        error,
        insightId,
      });
      throw error;
    }
  }

  /**
   * Predict viral potential
   */
  async predictViral(
    dto: PredictViralDto,
    organizationId: string,
    onBilling?: (amount: number) => void,
  ): Promise<{
    score: number;
    probability: number;
    estimatedReach: { min: number; max: number };
    factors: Array<{
      factor: string;
      impact: number;
      description: string;
    }>;
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

      const input = {
        max_completion_tokens: 1024,
        prompt,
      };
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
        estimatedReach: result.estimatedReach || { max: 0, min: 0 },
        factors: result.factors || [],
        probability: result.probability || 0,
        recommendations: result.recommendations || [],
        score: result.score || 0,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to predict viral potential', { error });
      throw error;
    }
  }

  /**
   * Get content gap analysis
   */
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

      // In production, this would analyze user's content library
      // For now, use AI to generate generic gaps

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

      const input = {
        max_completion_tokens: 1024,
        prompt,
      };
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
        missingTopics: result.missingTopics || [],
        opportunityAreas: result.opportunityAreas || [],
        underservedAudiences: result.underservedAudiences || [],
      };
    } catch (error: unknown) {
      this.logger.error('Failed to analyze content gaps', { error });
      throw error;
    }
  }

  /**
   * Get best posting times
   */
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

      const input = {
        max_completion_tokens: 1024,
        prompt,
      };
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
        recommendedTimes: result.recommendedTimes || [],
        timezone,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get best posting times', { error });
      throw error;
    }
  }

  /**
   * Get audience growth predictions
   */
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

      // No fake data — real follower counts are required for meaningful predictions
      throw new Error(
        `Insufficient data: real follower count for platform "${platform}" in organization "${organizationId}" is not available. ` +
          'Integrate AnalyticsSyncService or ContentPerformanceService to fetch actual follower data before using growth predictions.',
      );
    } catch (error: unknown) {
      this.logger.error('Failed to predict growth', { error });
      throw error;
    }
  }

  /**
   * Private: Generate forecast for metric
   */
  private async generateForecast(
    metric: string,
    period: string,
    organizationId: string,
  ): Promise<Forecast> {
    // No fake data — real metric values are required for meaningful forecasts
    throw new Error(
      `Insufficient data: real value for metric "${metric}" in organization "${organizationId}" is not available. ` +
        'Integrate AnalyticsSyncService or ContentPerformanceService to fetch actual metric data before using forecasts.',
    );
  }

  /**
   * Private: Generate AI insights
   */
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

    const input = {
      max_completion_tokens: 2048,
      prompt,
    };
    const response = await this.replicateService.generateTextCompletionSync(
      DEFAULT_TEXT_MODEL,
      input,
    );
    onBilling?.(await this.calculateDefaultTextCharge(input, response));

    const result = JsonParserUtil.parseAIResponse<Record<string, unknown>>(
      response,
      { insights: [] },
    );

    const insights = result.insights || [];

    const savedInsights: Insight[] = [];

    for (const insightData of insights) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Insights valid for 7 days

      const insight = new this.insightModel({
        actionableSteps: insightData.actionableSteps || [],
        category: insightData.type,
        confidence: insightData.confidence,
        description: insightData.description,
        expiresAt,
        impact: insightData.impact,
        organization: organizationId,
        relatedMetrics: insightData.relatedMetrics || [],
        title: insightData.title,
      });

      await insight.save();
      savedInsights.push(insight.toObject());
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
