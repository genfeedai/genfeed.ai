/**
 * Insights Service
 * Manages AI-generated insights and analytics recommendations
 */

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import type {
  IDateRange,
  IInsightResponse,
  IReportConfig,
} from '@genfeedai/interfaces';
import type { Insight } from '@genfeedai/props/analytics/insights.props';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';

class InsightsServiceClass extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/insights`, token);
  }

  /**
   * Get AI-generated insights
   */
  async getInsights(limit: number = ITEMS_PER_PAGE): Promise<Insight[]> {
    try {
      return await this.instance
        .get<JsonApiResponseDocument>(`?limit=${limit}`)
        .then((res) => {
          const data = deserializeCollection<IInsightResponse>(res.data);
          logger.info('Insights retrieved', { count: data.length });
          // Map backend response to frontend interface
          return data.map((insight) => ({
            actionableSteps: insight.actionableSteps || [],
            category: insight.category,
            confidence: insight.confidence,
            createdAt: new Date(insight.createdAt),
            description: insight.description,
            id: insight.id,
            impact: insight.impact,
            isRead: insight.isRead,
            relatedMetrics: insight.relatedMetrics || [],
            title: insight.title,
          }));
        });
    } catch (error) {
      logger.error('Failed to get insights', { error });
      throw error;
    }
  }

  /**
   * Mark an insight as read
   */
  async markAsRead(insightId: string): Promise<IInsightResponse> {
    try {
      const response = await this.instance.patch<JsonApiResponseDocument>(
        `${insightId}/read`,
      );
      logger.info('Insight marked as read', { insightId });
      return deserializeResource<IInsightResponse>(response.data);
    } catch (error) {
      logger.error('Failed to mark insight as read', { error, insightId });
      throw error;
    }
  }

  /**
   * Mark an insight as dismissed
   */
  async markAsDismissed(insightId: string): Promise<IInsightResponse> {
    try {
      const response = await this.instance.patch<JsonApiResponseDocument>(
        `${insightId}/dismiss`,
      );
      logger.info('Insight marked as dismissed', { insightId });
      return deserializeResource<IInsightResponse>(response.data);
    } catch (error) {
      logger.error('Failed to mark insight as dismissed', { error, insightId });
      throw error;
    }
  }
}

export class InsightsService {
  private static instances: Map<string, InsightsServiceClass> = new Map();

  static getInstance(token: string): InsightsServiceClass {
    if (!InsightsService.instances.has(token)) {
      InsightsService.instances.set(token, new InsightsServiceClass(token));
    }
    return InsightsService.instances.get(token)!;
  }

  static clearInstance(token: string): void {
    InsightsService.instances.delete(token);
  }
}

export class PredictiveAnalyticsService {
  private static instances: Map<string, PredictiveAnalyticsService> = new Map();

  private constructor(private readonly token: string) {}

  private get baseUrl(): string {
    return `${EnvironmentService.getApiUrl()}/analytics`;
  }

  static getInstance(token: string): PredictiveAnalyticsService {
    if (!PredictiveAnalyticsService.instances.has(token)) {
      PredictiveAnalyticsService.instances.set(
        token,
        new PredictiveAnalyticsService(token),
      );
    }

    return PredictiveAnalyticsService.instances.get(token)!;
  }

  static clearInstance(token: string): void {
    PredictiveAnalyticsService.instances.delete(token);
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | undefined>,
  ): string {
    const query = Object.entries(params ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return query ? `${this.baseUrl}${path}?${query}` : `${this.baseUrl}${path}`;
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    errorMessage: string,
  ): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(errorMessage);
    }

    return (await response.json()) as T;
  }

  async getTrendForecasts(metrics: string[], period: string = '30d') {
    const url = this.buildUrl('/predict/trends', {
      metrics: metrics.join(','),
      period,
    });

    return this.request(
      url,
      { method: 'GET' },
      'Failed to get trend forecasts',
    );
  }

  async getContentInsights(range?: IDateRange) {
    const url = this.buildUrl('/insights', {
      end: range?.end,
      start: range?.start,
    });

    return this.request(
      url,
      { method: 'GET' },
      'Failed to get content insights',
    );
  }

  async getEngagementScore(contentIds: string[] = []) {
    const url = this.buildUrl('/engagement/score');

    return this.request(
      url,
      {
        body: JSON.stringify({ contentIds }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      'Failed to get engagement score',
    );
  }

  async getROIAnalysis(range?: IDateRange) {
    const url = this.buildUrl('/roi', {
      end: range?.end,
      start: range?.start,
    });

    return this.request(url, { method: 'GET' }, 'Failed to get ROI analysis');
  }

  async getAudienceInsights(platform?: string) {
    const url = this.buildUrl('/audience', {
      platform,
    });

    return this.request(
      url,
      { method: 'GET' },
      'Failed to get audience insights',
    );
  }

  async getCompetitorAnalysis(competitorIds: string[] = []) {
    const url = this.buildUrl('/competitors');

    return this.request(
      url,
      {
        body: JSON.stringify({ competitorIds }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      'Failed to get competitor analysis',
    );
  }

  async getViralPrediction(contentId: string) {
    const url = this.buildUrl(`/predict/viral/${contentId}`);

    return this.request(
      url,
      { method: 'GET' },
      'Failed to get viral prediction',
    );
  }

  async predictViralPotential(contentId: string) {
    const url = this.buildUrl(`/predict/viral/${contentId}`);

    return this.request(
      url,
      { method: 'GET' },
      'Failed to predict viral potential',
    );
  }

  async getTopPatterns(limit: number = 10) {
    const url = this.buildUrl('/patterns/top', { limit: String(limit) });

    return this.request(url, { method: 'GET' }, 'Failed to get top patterns');
  }

  async getContentGaps() {
    const url = this.buildUrl('/gaps');

    return this.request(url, { method: 'GET' }, 'Failed to get content gaps');
  }

  async generateCustomReport(config: IReportConfig) {
    const url = this.buildUrl('/reports/generate');

    return this.request(
      url,
      {
        body: JSON.stringify(config),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      'Failed to generate report',
    );
  }
}
