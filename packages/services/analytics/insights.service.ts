/**
 * Insights Service
 * Manages AI-generated insights and analytics recommendations
 */

import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IInsightResponse } from '@genfeedai/contracts/interfaces';
import type { Insight } from '@genfeedai/props/analytics/insights.props';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { logger } from '@services/core/logger.service';
import { ServiceInstanceManager } from '@services/core/service-instance-manager';

const insightInstances = new ServiceInstanceManager<InsightsServiceClass>();

class InsightsServiceClass extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/insights`, token);
  }

  /**
   * Get AI-generated insights
   */
  async getInsights(
    limit: number = ITEMS_PER_PAGE,
    signal?: AbortSignal,
  ): Promise<Insight[]> {
    try {
      return await this.instance
        .get<JsonApiResponseDocument>(`?limit=${limit}`, { signal })
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
        `${insightId}`,
        { isRead: true },
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
        `${insightId}`,
        { isDismissed: true },
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
  static getInstance(token: string): InsightsServiceClass {
    const cached = insightInstances.get(InsightsService, token);
    if (cached) {
      return cached;
    }

    const instance = new InsightsServiceClass(token);
    insightInstances.set(InsightsService, token, instance);
    return instance;
  }

  static clearInstance(token: string): void {
    insightInstances.clear(InsightsService, token);
  }
}
