import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import {
  ApifyAccountLimitSuspension,
  ApifyActorRun,
  ApifyActorRunResponse,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyRunBudgetService } from '@api/services/integrations/apify/services/modules/apify-run-budget.service';
import {
  describeApifyError,
  isApifyAccountLimitError,
} from '@api/services/integrations/apify/utils/apify-error.util';
import { ViralScoringUtil } from '@api/services/integrations/apify/utils/viral-scoring.util';
import { ByokProvider } from '@genfeedai/contracts';
import type { ByokResolutionResult } from '@genfeedai/contracts/interfaces';
import { extractHashtags } from '@genfeedai/utils/server';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

type ApifyActorRegistration = {
  capability: string;
  mode: 'fallback_only' | 'temporarily_apify_primary';
};

/**
 * Production allowlist and migration inventory for every actor Genfeed can
 * start with the hosted token. Keeping this beside the only HTTP execution
 * boundary makes an unknown direct actor call fail before it can spend money.
 */
const APIFY_ACTOR_REGISTRY: Readonly<Record<string, ApifyActorRegistration>> = {
  'alexey/pinterest-scraper': {
    capability: 'pinterest.public-and-scoped-discovery',
    mode: 'fallback_only',
  },
  'apify/facebook-ads-scraper': {
    capability: 'meta.paid-creative-discovery',
    mode: 'temporarily_apify_primary',
  },
  'apify/instagram-comment-scraper': {
    capability: 'instagram.comments',
    mode: 'fallback_only',
  },
  'apify/instagram-hashtag-scraper': {
    capability: 'instagram.public-hashtag-discovery',
    mode: 'temporarily_apify_primary',
  },
  'apify/instagram-post-scraper': {
    capability: 'instagram.post-lookup',
    mode: 'fallback_only',
  },
  'apify/instagram-scraper': {
    capability: 'instagram.public-and-scoped-social-read',
    mode: 'temporarily_apify_primary',
  },
  'bernardo/youtube-comment-scraper': {
    capability: 'youtube.comments',
    mode: 'fallback_only',
  },
  'clockworks/tiktok-ads-scraper': {
    capability: 'tiktok.paid-creative-discovery',
    mode: 'temporarily_apify_primary',
  },
  'clockworks/tiktok-comments-scraper': {
    capability: 'tiktok.comments',
    mode: 'fallback_only',
  },
  'clockworks/tiktok-profile-scraper': {
    capability: 'tiktok.profile-and-account-content',
    mode: 'fallback_only',
  },
  'clockworks/tiktok-scraper': {
    capability: 'tiktok.public-and-scoped-social-read',
    mode: 'temporarily_apify_primary',
  },
  'clockworks/tiktok-trends-scraper': {
    capability: 'tiktok.public-trend-discovery',
    mode: 'temporarily_apify_primary',
  },
  'curious_coder/linkedin-profile-scraper': {
    capability: 'linkedin.public-creator-ingestion',
    mode: 'temporarily_apify_primary',
  },
  'quacker/twitter-scraper': {
    capability: 'x.social-read',
    mode: 'fallback_only',
  },
  'quacker/twitter-trends-scraper': {
    capability: 'x.public-trend-discovery',
    mode: 'fallback_only',
  },
  'streamers/youtube-channel-scraper': {
    capability: 'youtube.channel-lookup',
    mode: 'fallback_only',
  },
  'streamers/youtube-scraper': {
    capability: 'youtube.video-discovery',
    mode: 'fallback_only',
  },
  'trudax/reddit-comments-scraper': {
    capability: 'reddit.comments',
    mode: 'fallback_only',
  },
  'trudax/reddit-scraper': {
    capability: 'reddit.social-read',
    mode: 'fallback_only',
  },
};

/**
 * ApifyBaseService
 *
 * Shared utilities for all Apify platform sub-services.
 * Provides actor execution, polling, API token management, and metrics helpers.
 */
@Injectable()
export class ApifyBaseService {
  /**
   * How long to hold off calls for an account that reported a usage limit.
   * Short enough that scraping resumes on its own once the owner raises the
   * limit or the billing period rolls over, long enough that an exhausted
   * account is not hammered on every scheduled run.
   */
  static readonly ACCOUNT_LIMIT_SUSPENSION_MS = 15 * 60 * 1000;

  private static readonly HOSTED_SCOPE = 'hosted';

  private readonly apiUrl = 'https://api.apify.com/v2';
  private readonly constructorName: string = String(this.constructor.name);
  private readonly actorPathPattern = /^[^/~]+\/[^/~]+$/;

  /**
   * Usage-limit suspensions keyed by token scope, so one organization's
   * exhausted BYOK account never blocks the hosted token or another org.
   */
  private readonly accountLimitSuspensions = new Map<
    string,
    ApifyAccountLimitSuspension
  >();

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
    private readonly runBudgetService: ApifyRunBudgetService,
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

    return this.executeActor<T>({
      actorId,
      failureLabel: `${this.constructorName}.runActor failed for ${actorId}`,
      input,
      scope: ApifyBaseService.HOSTED_SCOPE,
      token,
    });
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

    const data = await this.executeActor<T>({
      actorId,
      failureLabel: `${this.constructorName}.runActorForOrg failed for ${actorId} (org: ${orgId}, source: ${source})`,
      input,
      scope:
        source === 'byok' ? `byok:${orgId}` : ApifyBaseService.HOSTED_SCOPE,
      token,
    });

    return { data, source };
  }

  /**
   * Shared actor execution: refuse to call an account that is already known to
   * be over its usage limit, then start the run, wait for it, and read the
   * dataset.
   */
  private async executeActor<T>({
    actorId,
    failureLabel,
    input,
    scope,
    token,
  }: {
    actorId: string;
    failureLabel: string;
    input: object;
    scope: string;
    token: string;
  }): Promise<T[]> {
    const registration = this.resolveActorRegistration(actorId);
    if (
      scope === ApifyBaseService.HOSTED_SCOPE &&
      this.configService.get('NODE_ENV') === 'production' &&
      !registration
    ) {
      this.loggerService.error(
        `${this.constructorName} blocked unregistered hosted Apify actor ${actorId}`,
      );
      throw new ServiceUnavailableException(
        `Apify actor ${actorId} is not registered for hosted production execution`,
      );
    }

    const suspension = this.getActiveAccountLimitSuspension(scope);
    if (suspension) {
      throw this.buildAccountLimitException(suspension);
    }

    const budget = await this.runBudgetService.consumeRun(
      scope,
      actorId,
      token,
    );
    if (!budget.isAllowed) {
      throw new ServiceUnavailableException(
        budget.reason ?? 'Apify run budget exhausted',
      );
    }

    const url = this.buildActorRunUrl(actorId, budget.maxTotalChargeUsd);

    this.loggerService.log(
      `${this.constructorName} starting governed Apify actor`,
      {
        actorId,
        budgetDecision: 'allowed',
        capability: registration?.capability ?? 'unclassified_non_production',
        maxTotalChargeUsd: budget.maxTotalChargeUsd,
        mode: registration?.mode ?? 'unclassified_non_production',
        scope,
      },
    );

    try {
      const runResponse = await firstValueFrom(
        this.httpService.post<ApifyActorRunResponse>(url, input, {
          headers: this.buildAuthHeaders(token),
        }),
      );

      const runId = runResponse.data.data.id;
      const datasetId = runResponse.data.data.defaultDatasetId;

      const completedRun = await this.waitForRun(runId, token);
      await this.runBudgetService.reconcileRun(
        budget.reservation,
        completedRun.usageTotalUsd,
      );
      if (completedRun.status !== 'SUCCEEDED') {
        throw new ServiceUnavailableException(
          `Actor run ${runId} ended with status: ${completedRun.status}`,
        );
      }

      const datasetUrl = `${this.apiUrl}/datasets/${datasetId}/items`;
      const datasetResponse = await firstValueFrom(
        this.httpService.get<T[]>(datasetUrl, {
          headers: this.buildAuthHeaders(token),
        }),
      );

      return datasetResponse.data;
    } catch (error: unknown) {
      if (isApifyAccountLimitError(error)) {
        this.recordAccountLimit(scope, actorId, error);
        throw error;
      }

      this.loggerService.error(failureLabel, error);
      throw error;
    }
  }

  /**
   * Returns the live suspension for a token scope, clearing it once expired.
   */
  private getActiveAccountLimitSuspension(
    scope: string,
  ): ApifyAccountLimitSuspension | null {
    const suspension = this.accountLimitSuspensions.get(scope);
    if (!suspension) {
      return null;
    }

    if (Date.now() >= suspension.suspendedUntilMs) {
      this.accountLimitSuspensions.delete(scope);
      return null;
    }

    return suspension;
  }

  /**
   * Record a usage-limit refusal and surface it as one actionable line rather
   * than an anonymous axios stack on every scheduled call.
   */
  private recordAccountLimit(
    scope: string,
    actorId: string,
    error: unknown,
  ): void {
    const suspendedUntilMs =
      Date.now() + ApifyBaseService.ACCOUNT_LIMIT_SUSPENSION_MS;

    this.accountLimitSuspensions.set(scope, {
      reason: describeApifyError(error),
      suspendedUntilMs,
    });

    this.loggerService.error(
      `${this.constructorName} Apify rejected ${actorId} for the "${scope}" token — ${describeApifyError(error)}. Apify calls on this token are suspended until ${new Date(suspendedUntilMs).toISOString()}; raise the account usage limit or upgrade the plan to restore scraping.`,
      undefined,
      { actorId, scope, suspendedUntilMs },
    );
  }

  private buildAccountLimitException(
    suspension: ApifyAccountLimitSuspension,
  ): ServiceUnavailableException {
    return new ServiceUnavailableException(
      `Apify is over its account usage limit (${suspension.reason}). Calls are suspended until ${new Date(suspension.suspendedUntilMs).toISOString()}.`,
    );
  }

  /**
   * Wait for an actor run to complete
   */
  private async waitForRun(
    runId: string,
    token: string,
    maxWaitMs: number = 120000,
  ): Promise<ApifyActorRun> {
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

      if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
        return response.data.data;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Actor run ${runId} timed out after ${maxWaitMs}ms`);
  }

  private buildActorRunUrl(
    actorId: string,
    maxTotalChargeUsd?: number,
  ): string {
    const url = `${this.apiUrl}/acts/${this.normalizeActorId(actorId)}/runs`;
    return maxTotalChargeUsd === undefined
      ? url
      : `${url}?maxTotalChargeUsd=${encodeURIComponent(String(maxTotalChargeUsd))}`;
  }

  private normalizeActorId(actorId: string): string {
    if (this.actorPathPattern.test(actorId)) {
      return encodeURIComponent(actorId.replace('/', '~'));
    }

    return encodeURIComponent(actorId);
  }

  private resolveActorRegistration(
    actorId: string,
  ): ApifyActorRegistration | undefined {
    const canonicalActorId = actorId.includes('~')
      ? actorId.replace('~', '/')
      : actorId;
    return APIFY_ACTOR_REGISTRY[canonicalActorId];
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
    const hoursOld = publishedAt
      ? (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60)
      : 24;

    return ViralScoringUtil.calculateVideoMetrics({
      commentCount,
      hoursAgo: hoursOld,
      likeCount,
      shareCount,
      viewCount,
    });
  }

  /**
   * Calculate virality score based on engagement metrics
   */
  calculateViralityScore(views: number, engagement: number): number {
    return ViralScoringUtil.calculateViralityScore(views, engagement);
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
    return extractHashtags(text);
  }
}
