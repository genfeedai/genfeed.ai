/**
 * Link Tracking Service (MVP)
 * Simple CTA tracking with Google Analytics integration
 */

import type {
  IContentCTAStats,
  IGoogleAnalyticsEvent,
  ILinkPerformance,
  ITrackedLink,
  IUTMBuilder,
} from '@genfeedai/interfaces/analytics/link-tracking.interface';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import { logger } from '@services/core/logger.service';

export class LinkTrackingService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/analytics/link-tracking`, token);
  }

  public static getInstance(token: string): LinkTrackingService {
    return HTTPBaseService.getBaseServiceInstance(
      LinkTrackingService,
      token,
    ) as LinkTrackingService;
  }

  /**
   * Generate tracking link with UTM parameters
   */
  public async generateTrackingLink(params: {
    url: string;
    contentId?: string;
    contentType?: 'video' | 'image' | 'article' | 'caption';
    platform?: string;
    brandId?: string;
    campaignName?: string;
    customSlug?: string;
    utm?: Partial<IUTMBuilder>;
  }): Promise<ITrackedLink> {
    try {
      const response = await this.instance
        .post<ITrackedLink>('tracking/links', params)
        .then((res) => res.data);
      return response;
    } catch (error) {
      logger.error('Failed to generate tracking link', { error });
      throw error;
    }
  }

  /**
   * Get link by ID
   */
  public async getLink(linkId: string): Promise<ITrackedLink> {
    try {
      const response = await this.instance
        .get<ITrackedLink>(`tracking/links/${linkId}`)
        .then((res) => res.data);
      return response;
    } catch (error) {
      logger.error('Failed to get link', { error });
      throw error;
    }
  }

  /**
   * Get all links for content
   */
  public async getContentLinks(contentId: string): Promise<ITrackedLink[]> {
    try {
      const response = await this.instance
        .get<ITrackedLink[]>(`tracking/links?contentId=${contentId}`)
        .then((res) => res.data);

      return response;
    } catch (error) {
      logger.error('Failed to get content links', { error });
      throw error;
    }
  }

  /**
   * Get link performance
   */
  public async getLinkPerformance(linkId: string): Promise<ILinkPerformance> {
    try {
      const response = await this.instance
        .get<ILinkPerformance>(`tracking/links/${linkId}/performance`)
        .then((res) => res.data);

      return response;
    } catch (error) {
      logger.error('Failed to get link performance', { error });
      throw error;
    }
  }

  /**
   * Get CTA stats for content
   */
  public async getContentCTAStats(
    contentId: string,
  ): Promise<IContentCTAStats> {
    try {
      const response = await this.instance
        .get<IContentCTAStats>(`tracking/content/${contentId}/cta-stats`)
        .then((res) => res.data);

      return response;
    } catch (error) {
      logger.error('Failed to get content CTA stats', { error });
      throw error;
    }
  }

  /**
   * Update link
   */
  public async updateLink(
    linkId: string,
    updates: Partial<ITrackedLink>,
  ): Promise<ITrackedLink> {
    try {
      const response = await this.instance
        .patch<ITrackedLink>(`tracking/links/${linkId}`, updates)
        .then((res) => res.data);

      return response;
    } catch (error) {
      logger.error('Failed to update link', { error });
      throw error;
    }
  }

  /**
   * Delete link
   */
  public async deleteLink(linkId: string): Promise<void> {
    try {
      await this.instance.delete<void>(`tracking/links/${linkId}`);
    } catch (error) {
      logger.error('Failed to delete link', { error });
      throw error;
    }
  }

  /**
   * Build UTM URL (client-side helper)
   */
  public buildUTMUrl(params: IUTMBuilder): string {
    const url = new URL(params.url);

    url.searchParams.set('utm_source', params.source);
    url.searchParams.set('utm_medium', params.medium);

    if (params.campaign) {
      url.searchParams.set('utm_campaign', params.campaign);
    }
    if (params.content) {
      url.searchParams.set('utm_content', params.content);
    }
    if (params.term) {
      url.searchParams.set('utm_term', params.term);
    }

    return url.toString();
  }

  /**
   * Send event to Google Analytics 4
   */
  public sendGAEvent(event: IGoogleAnalyticsEvent): void {
    if (typeof window === 'undefined') {
      return;
    }

    // Check if gtag is available
    if (
      'gtag' in window &&
      typeof (window as unknown as { gtag?: (...args: unknown[]) => void })
        .gtag === 'function'
    ) {
      const gtag = (window as unknown as { gtag: (...args: unknown[]) => void })
        .gtag;

      gtag('event', event.eventName, event.eventParams);

      logger.info('GA4 event sent', {
        contentId: event.eventParams.content_id,
        eventName: event.eventName,
      });
    } else {
      logger.error('Google Analytics not available');
    }
  }

  /**
   * Track link click (client-side)
   */
  public trackLinkClick(params: {
    linkId: string;
    sessionId: string;
    gaClientId?: string;
  }): void {
    // Fire and forget - don't block user
    fetch(`${this.baseURL}/tracking/clicks`, {
      body: JSON.stringify(params),
      headers: {
        'Content-Type': 'application/json',
      },
      keepalive: true,
      method: 'POST',
    }).catch((error) => {
      logger.error('Click tracking failed', { error });
      // Don't throw - tracking failures shouldn't break UX
    });

    // Also send to Google Analytics
    this.sendGAEvent({
      eventName: 'link_click',
      eventParams: {
        link_id: params.linkId,
        session_id: params.sessionId,
      },
    });
  }

  /**
   * Track content view (for CTR calculation)
   */
  public trackContentView(params: {
    contentId: string;
    contentType: string;
    platform?: string;
  }): void {
    // Send to Google Analytics
    this.sendGAEvent({
      eventName: 'content_view',
      eventParams: {
        content_id: params.contentId,
        content_type: params.contentType,
        platform: params.platform,
      },
    });
  }

  /**
   * Track CTA impression
   */
  public trackCTAImpression(params: {
    linkId: string;
    contentId: string;
    position?: string; // e.g., 'bio', 'caption', 'description'
  }): void {
    // Send to Google Analytics
    this.sendGAEvent({
      eventName: 'cta_impression',
      eventParams: {
        content_id: params.contentId,
        link_id: params.linkId,
        position: params.position,
      },
    });
  }

  /**
   * Generate session ID (for tracking unique users)
   * Note: localStorage is appropriate here for client-side analytics tracking,
   * not for data persistence
   */
  public getOrCreateSessionId(): string {
    if (typeof window === 'undefined') {
      return '';
    }

    const storageKey = 'genfeed_session_id';
    let sessionId = localStorage.getItem(storageKey);

    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(storageKey, sessionId);
    }

    return sessionId;
  }

  /**
   * Get Google Analytics Client ID (for GA4 integration)
   */
  public getGAClientId(): string | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }

    // Try to get from gtag
    if ('gtag' in window) {
      const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
      if (typeof gtag === 'function') {
        let clientId: string | undefined;
        gtag('get', 'GA_MEASUREMENT_ID', 'client_id', (id: string) => {
          clientId = id;
        });
        return clientId;
      }
    }

    return undefined;
  }
}
