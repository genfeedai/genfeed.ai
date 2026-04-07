import { ConfigService } from '@api/config/config.service';
import {
  ByokProviderFactoryService,
  ByokResolutionResult,
} from '@api/services/byok/byok-provider-factory.service';
import { ApifyActorRunResponse } from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable, Optional } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/**
 * ApifyBaseService
 *
 * Shared utilities for all Apify platform sub-services.
 * Provides actor execution, polling, API token management, and metrics helpers.
 */
@Injectable()
export class ApifyBaseService {
  private readonly apiUrl = 'https://api.apify.com/v2';
  private readonly constructorName: string = String(this.constructor.name);
  private readonly actorPathPattern = /^[^/~]+\/[^/~]+$/;

  /**
   * Apify Actor IDs for different platforms
   * These are community or official actors from the Apify Store
   */
  readonly ACTORS = {
    INSTAGRAM_COMMENT_SCRAPER: 'apify/instagram-comment-scraper',

    // Instagram scrapers
    INSTAGRAM_HASHTAG: 'apify/instagram-hashtag-scraper',
    INSTAGRAM_POST_SCRAPER: 'apify/instagram-post-scraper',
    INSTAGRAM_SCRAPER: 'apify/instagram-scraper',

    // Pinterest scrapers
    PINTEREST_SCRAPER: 'alexey/pinterest-scraper',
    REDDIT_COMMENT_SCRAPER: 'trudax/reddit-comments-scraper',

    // Reddit scrapers
    REDDIT_SCRAPER: 'trudax/reddit-scraper',

    // TikTok scrapers
    TIKTOK_COMMENT_SCRAPER: 'clockworks/tiktok-comments-scraper',
    TIKTOK_SCRAPER: 'clockworks/tiktok-scraper',
    // TikTok scrapers
    TIKTOK_TRENDS: 'clockworks/tiktok-trends-scraper',
    TIKTOK_USER_SCRAPER: 'clockworks/tiktok-profile-scraper',
    TWITTER_SCRAPER: 'quacker/twitter-scraper',

    // Twitter/X scrapers
    TWITTER_TRENDS: 'quacker/twitter-trends-scraper',
    YOUTUBE_CHANNEL_SCRAPER: 'streamers/youtube-channel-scraper',
    YOUTUBE_COMMENT_SCRAPER: 'bernardo/youtube-comment-scraper',

    // YouTube scrapers
    YOUTUBE_SCRAPER: 'streamers/youtube-scraper',
  };

  constructor(
    private readonly configService: ConfigService,
    readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    @Optional()
    private readonly byokProviderFactory?: ByokProviderFactoryService,
  ) {}

  /**
   * Get API token from config.
   * Returns null if not configured (graceful fallback).
   */
  getApiToken(): string | null {
    const token = this.configService.get('APIFY_API_TOKEN');
    if (!token) {
      this.loggerService.warn(
        `${this.constructorName} APIFY_API_TOKEN is not configured — Apify calls will be skipped`,
      );
      return null;
    }
    return token;
  }

  /**
   * Run an Apify actor and wait for results.
   * Returns empty array if no API token is configured.
   */
  async runActor<T>(actorId: string, input: object): Promise<T[]> {
    const token = this.getApiToken();
    if (!token) {
      return [];
    }
    const url = this.buildActorRunUrl(actorId);

    try {
      // Start the actor run
      const runResponse = await firstValueFrom(
        this.httpService.post<ApifyActorRunResponse>(url, input, {
          headers: this.buildAuthHeaders(token),
        }),
      );

      const runId = runResponse.data.data.id;
      const datasetId = runResponse.data.data.defaultDatasetId;

      // Wait for the run to finish (with timeout)
      await this.waitForRun(runId, token);

      // Fetch results from the dataset
      const datasetUrl = `${this.apiUrl}/datasets/${datasetId}/items`;
      const datasetResponse = await firstValueFrom(
        this.httpService.get<T[]>(datasetUrl, {
          headers: this.buildAuthHeaders(token),
        }),
      );

      return datasetResponse.data;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.runActor failed for ${actorId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Run an Apify actor for a specific organization.
   * Resolves BYOK key first, falls back to global token.
   * Returns empty array if no token is available from either source.
   */
  async runActorForOrg<T>(
    orgId: string,
    actorId: string,
    input: object,
  ): Promise<{ data: T[]; source: ByokResolutionResult['source'] }> {
    let token: string | null = null;
    let source: ByokResolutionResult['source'] = 'hosted';

    if (this.byokProviderFactory) {
      const resolution = await this.byokProviderFactory.resolveProvider(
        orgId,
        ByokProvider.APIFY,
      );

      if (resolution.source === 'byok' && resolution.apiKey) {
        token = resolution.apiKey;
        source = 'byok';
      }
    }

    if (!token) {
      token = this.getApiToken();
      source = 'hosted';
    }

    if (!token) {
      return { data: [], source: 'hosted' };
    }

    const url = this.buildActorRunUrl(actorId);

    try {
      const runResponse = await firstValueFrom(
        this.httpService.post<ApifyActorRunResponse>(url, input, {
          headers: this.buildAuthHeaders(token),
        }),
      );

      const runId = runResponse.data.data.id;
      const datasetId = runResponse.data.data.defaultDatasetId;

      await this.waitForRun(runId, token);

      const datasetUrl = `${this.apiUrl}/datasets/${datasetId}/items`;
      const datasetResponse = await firstValueFrom(
        this.httpService.get<T[]>(datasetUrl, {
          headers: this.buildAuthHeaders(token),
        }),
      );

      return { data: datasetResponse.data, source };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.runActorForOrg failed for ${actorId} (org: ${orgId}, source: ${source})`,
        error,
      );
      throw error;
    }
  }

  /**
   * Wait for an actor run to complete
   */
  private async waitForRun(
    runId: string,
    token: string,
    maxWaitMs: number = 120000,
  ): Promise<void> {
    const startTime = Date.now();
    const pollIntervalMs = 5000;

    while (Date.now() - startTime < maxWaitMs) {
      const statusUrl = `${this.apiUrl}/actor-runs/${runId}`;
      const response = await firstValueFrom(
        this.httpService.get<ApifyActorRunResponse>(statusUrl, {
          headers: this.buildAuthHeaders(token),
        }),
      );

      const status = response.data.data.status;

      if (status === 'SUCCEEDED') {
        return;
      }

      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
        throw new Error(`Actor run ${runId} ended with status: ${status}`);
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Actor run ${runId} timed out after ${maxWaitMs}ms`);
  }

  private buildActorRunUrl(actorId: string): string {
    return `${this.apiUrl}/acts/${this.normalizeActorId(actorId)}/runs`;
  }

  private normalizeActorId(actorId: string): string {
    if (this.actorPathPattern.test(actorId)) {
      return encodeURIComponent(actorId.replace('/', '~'));
    }

    return encodeURIComponent(actorId);
  }

  private buildAuthHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Calculate engagement metrics for video content
   * Reused across all platform normalization methods
   */
  calculateEngagementMetrics(
    viewCount: number,
    likeCount: number,
    commentCount: number,
    shareCount: number,
    publishedAt?: Date,
  ): {
    engagementRate: number;
    velocity: number;
    viralScore: number;
  } {
    const totalEngagement = likeCount + commentCount + shareCount;
    const engagementRate =
      viewCount > 0 ? (totalEngagement / viewCount) * 100 : 0;
    const hoursOld = publishedAt
      ? (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60)
      : 24;
    const velocity = hoursOld > 0 ? viewCount / hoursOld : 0;

    return {
      engagementRate: Math.round(engagementRate * 100) / 100,
      velocity: Math.round(velocity),
      viralScore: this.calculateViralScore(viewCount, engagementRate, velocity),
    };
  }

  /**
   * Calculate virality score based on engagement metrics
   */
  calculateViralityScore(views: number, engagement: number): number {
    // Simple formula: normalize to 0-100 scale
    const viewScore = Math.min(50, Math.log10(views + 1) * 10);
    const engagementScore = Math.min(50, Math.log10(engagement + 1) * 15);
    return Math.round(viewScore + engagementScore);
  }

  /**
   * Calculate growth rate as a percentage.
   *
   * When previousValue is provided, returns real percentage growth:
   *   ((current - previous) / previous) * 100
   *
   * When only currentValue is available (no historical snapshot),
   * uses a volume-based heuristic that normalizes the value
   * into a 0-100 scale based on engagement thresholds.
   */
  calculateGrowthRate(currentValue: number, previousValue?: number): number {
    if (previousValue !== undefined && previousValue > 0) {
      return Math.round(((currentValue - previousValue) / previousValue) * 100);
    }

    if (previousValue !== undefined && previousValue === 0) {
      return currentValue > 0 ? 100 : 0;
    }

    // No historical data: estimate using volume-based thresholds.
    // Low volume (<1k) = low growth signal, high volume (>1M) = strong signal.
    if (currentValue <= 0) {
      return 0;
    }

    const thresholds = [
      { maxGrowth: 10, min: 0 },
      { maxGrowth: 25, min: 1000 },
      { maxGrowth: 45, min: 10000 },
      { maxGrowth: 65, min: 100000 },
      { maxGrowth: 85, min: 1000000 },
      { maxGrowth: 100, min: 10000000 },
    ];

    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (currentValue >= thresholds[i].min) {
        return thresholds[i].maxGrowth;
      }
    }

    return 0;
  }

  /**
   * Calculate viral score for videos
   */
  private calculateViralScore(
    viewCount: number,
    engagementRate: number,
    velocity: number,
  ): number {
    // Weighted formula for viral potential
    const viewScore = Math.min(40, Math.log10(viewCount + 1) * 8);
    const engagementScore = Math.min(30, engagementRate * 3);
    const velocityScore = Math.min(30, Math.log10(velocity + 1) * 10);
    return Math.round(viewScore + engagementScore + velocityScore);
  }

  /**
   * Parse YouTube duration string to seconds
   */
  parseDuration(duration?: string): number | undefined {
    if (!duration) {
      return undefined;
    }

    // Handle ISO 8601 duration format (PT1H2M3S)
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (match) {
      const hours = parseInt(match[1] || '0', 10);
      const minutes = parseInt(match[2] || '0', 10);
      const seconds = parseInt(match[3] || '0', 10);
      return hours * 3600 + minutes * 60 + seconds;
    }

    return undefined;
  }

  /**
   * Extract hashtags from text
   */
  extractHashtags(text: string): string[] {
    const matches = text.match(/#[\w]+/g);
    return matches ? matches.map((h) => h.substring(1)) : [];
  }
}
