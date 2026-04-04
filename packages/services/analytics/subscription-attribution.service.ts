/**
 * Subscription Attribution Service
 * Track which content leads to subscriptions (lightweight integration with existing Stripe)
 */

import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';

export interface ISubscriptionAttribution {
  id: string;
  organizationId: string;

  // Subscription info
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  userId: string;
  email: string;
  plan: string;
  amount: number;

  // Attribution (what content led to this?)
  source?: {
    contentId: string;
    contentType: 'video' | 'image' | 'article';
    platform: string;
    linkId?: string;
    sessionId?: string;
  };

  // UTM parameters (from link tracking)
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
  };

  // Timeline
  subscribedAt: Date;
  expiresAt?: Date;
  status: 'active' | 'canceled' | 'expired';
}

export interface IContentSubscriptionStats {
  contentId: string;
  contentType: string;

  totalSubscriptions: number;
  totalRevenue: number;
  avgOrderValue: number;
  conversionRate?: number; // If you have view counts

  byPlan: Record<
    string,
    {
      count: number;
      revenue: number;
    }
  >;

  timeline: Record<string, number>; // Subscriptions by date
}

class SubscriptionAttributionServiceClass {
  private baseURL: string;
  private token: string;

  constructor(baseURL: string, token: string) {
    this.baseURL = baseURL;
    this.token = token;
  }

  /**
   * Track subscription with content attribution
   * Call this after successful Stripe subscription
   */
  async trackSubscription(params: {
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    userId: string;
    email: string;
    plan: string;
    amount: number;

    // Attribution (from session storage or URL params)
    sourceContentId?: string;
    sourceContentType?: 'video' | 'image' | 'article';
    sourcePlatform?: string;
    sourceLinkId?: string;
    sessionId?: string;
    utm?: {
      source?: string;
      medium?: string;
      campaign?: string;
      content?: string;
    };
  }): Promise<ISubscriptionAttribution> {
    try {
      const response = await fetch(
        `${this.baseURL}/analytics/subscription-attribution`,
        {
          body: JSON.stringify(params),
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to track subscription attribution');
      }

      const attribution = await response.json();
      logger.info('Subscription attribution tracked', {
        contentId: params.sourceContentId,
        subscriptionId: params.stripeSubscriptionId,
      });
      return attribution;
    } catch (error) {
      logger.error('Subscription attribution tracking failed', { error });
      // Don't throw - tracking failure shouldn't break subscription flow
      throw error;
    }
  }

  /**
   * Get subscription stats for content
   */
  async getContentSubscriptionStats(
    contentId: string,
  ): Promise<IContentSubscriptionStats> {
    try {
      const response = await fetch(
        `${this.baseURL}/analytics/content/${contentId}/subscription-stats`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
          method: 'GET',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to get subscription stats');
      }

      return await response.json();
    } catch (error) {
      logger.error('Failed to get subscription stats', { error });
      throw error;
    }
  }

  /**
   * Get top performing content (by subscriptions)
   */
  async getTopContentBySubscriptions(params?: {
    limit?: number;
    period?: '7d' | '30d' | '90d';
  }): Promise<
    Array<{
      contentId: string;
      contentType: string;
      subscriptions: number;
      revenue: number;
      conversionRate?: number;
    }>
  > {
    try {
      const queryParams = new URLSearchParams();
      if (params?.limit) {
        queryParams.append('limit', params.limit.toString());
      }
      if (params?.period) {
        queryParams.append('period', params.period);
      }

      const queryString = queryParams.toString();
      const url = queryString
        ? `${this.baseURL}/analytics/top-content-by-subscriptions?${queryString}`
        : `${this.baseURL}/analytics/top-content-by-subscriptions`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to get top content');
      }

      return await response.json();
    } catch (error) {
      logger.error('Failed to get top content by subscriptions', { error });
      throw error;
    }
  }

  /**
   * Store content attribution in session (client-side helper)
   * Call this when user views content, before they subscribe
   */
  storeContentAttribution(params: {
    contentId: string;
    contentType: 'video' | 'image' | 'article';
    platform?: string;
    linkId?: string;
  }): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const attribution = {
        contentId: params.contentId,
        contentType: params.contentType,
        linkId: params.linkId,
        platform: params.platform,
        timestamp: new Date().toISOString(),
      };

      sessionStorage.setItem(
        'genfeed_subscription_attribution',
        JSON.stringify(attribution),
      );

      logger.info('Content attribution stored in session', {
        contentId: params.contentId,
      });
    } catch (error) {
      logger.error('Failed to store content attribution', { error });
    }
  }

  /**
   * Get stored content attribution from session
   * Call this when user subscribes to get attribution data
   */
  getStoredAttribution(): {
    contentId?: string;
    contentType?: string;
    platform?: string;
    linkId?: string;
    timestamp?: string;
  } | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = sessionStorage.getItem('genfeed_subscription_attribution');
      if (!stored) {
        return null;
      }

      return JSON.parse(stored);
    } catch (error) {
      logger.error('Failed to get stored attribution', { error });
      return null;
    }
  }

  /**
   * Clear stored attribution after successful tracking
   */
  clearStoredAttribution(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      sessionStorage.removeItem('genfeed_subscription_attribution');
    } catch (error) {
      logger.error('Failed to clear stored attribution', { error });
    }
  }
}

export class SubscriptionAttributionService {
  private static instances: Map<string, SubscriptionAttributionServiceClass> =
    new Map();

  static getInstance(token: string): SubscriptionAttributionServiceClass {
    if (!SubscriptionAttributionService.instances.has(token)) {
      SubscriptionAttributionService.instances.set(
        token,
        new SubscriptionAttributionServiceClass(
          EnvironmentService.apiEndpoint,
          token,
        ),
      );
    }
    return SubscriptionAttributionService.instances.get(token)!;
  }

  static clearInstance(token: string): void {
    SubscriptionAttributionService.instances.delete(token);
  }
}
