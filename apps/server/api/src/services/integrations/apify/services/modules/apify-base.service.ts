import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { CacheService } from '@api/services/cache/cache.service';
import {
  ApifyAccountLimitSuspension,
  ApifyActorRun,
  ApifyActorRunResponse,
} from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { currentApifyCaller } from '@api/services/integrations/apify/utils/apify-caller.context';
import {
  ApifyAccountSuspendedException,
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

const ACTOR_PATH_PATTERN = /^[^/~]+\/[^/~]+$/;
const ISO8601_DURATION_PATTERN = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;

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
  'automation-lab/twitter-trends-scraper': {
    capability: 'x.public-trend-discovery',
    mode: 'fallback_only',
  },
  'bernardo/youtube-comment-scraper': {
    capability: 'youtube.comments',
    mode: 'fallback_only',
  },
  'lexis-solutions/tiktok-ads-scraper': {
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
  'fatihtahta/pinterest-scraper-search': {
    capability: 'pinterest.public-and-scoped-discovery',
    mode: 'fallback_only',
  },
  'lexis-solutions/google-ads-scraper': {
    capability: 'google.paid-creative-discovery',
    mode: 'temporarily_apify_primary',
  },
  'quacker/twitter-scraper': {
    capability: 'x.social-read',
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

  /** The shared hosted-token suspension is visible to every process. */
  private static readonly SUSPENSION_CACHE_PREFIX = 'apify:account-limit:';

  /** One operator alert per window, however many processes hit the limit. */
  private static readonly ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;

  private static readonly HOSTED_SCOPE = 'hosted';

  private readonly apiUrl = 'https://api.apify.com/v2';
  private readonly constructorName: string = String(this.constructor.name);
  private readonly actorPathPattern = ACTOR_PATH_PATTERN;

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

    // LinkedIn scrapers
    LINKEDIN_PROFILE_SCRAPER: 'curious_coder/linkedin-profile-scraper',

    // Pinterest scrapers
    PINTEREST_SCRAPER: 'fatihtahta/pinterest-scraper-search',
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
    TWITTER_TRENDS: 'automation-lab/twitter-trends-scraper',
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
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly activityRecorder?: ActivityRecorderService,
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
   * Resolve the token for a research collection. `hosted-only` and
   * `byok-only` never fall across accounts, so a retry cannot bill a
   * different token than the run it is trying to recover.
   */
  async resolveCollectionToken(
    orgId: string,
    mode: 'byok-only' | 'hosted-only' | 'prefer-byok',
  ): Promise<{ source: 'byok' | 'hosted'; token: string } | null> {
    if (mode !== 'hosted-only' && this.byokProviderFactory) {
      const resolution = await this.byokProviderFactory.resolveProvider(
        orgId,
        ByokProvider.APIFY,
      );
      if (resolution.source === 'byok' && resolution.apiKey) {
        return { source: 'byok', token: resolution.apiKey };
      }
    }
    if (mode === 'byok-only') return null;
    const token = this.getApiToken();
    return token ? { source: 'hosted', token } : null;
  }

  assertRegisteredHostedActor(actorId: string): void {
    if (this.configService.get('NODE_ENV') !== 'production') return;
    if (this.resolveActorRegistration(actorId)) return;
    this.loggerService.error(
      `${this.constructorName} blocked unregistered hosted Apify actor ${actorId}`,
    );
    throw new ServiceUnavailableException(
      `Apify actor ${actorId} is not registered for hosted production execution`,
    );
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
    const resolved = await this.resolveCollectionToken(orgId, 'prefer-byok');
    if (!resolved) {
      return { data: [], source: 'hosted' };
    }
    const { source, token } = resolved;

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
    if (scope === ApifyBaseService.HOSTED_SCOPE) {
      this.assertRegisteredHostedActor(actorId);
    }

    // Apify's own account usage limit is the only spend brake; the
    // account-limit suspension below stops calls once Apify reports it.
    await this.assertCollectionAdmission(scope);

    const url = this.buildActorRunUrl(actorId);

    const caller = currentApifyCaller();
    this.loggerService.log(
      `${this.constructorName} starting governed Apify actor`,
      {
        actorId,
        caller,
        capability: registration?.capability ?? 'unclassified_non_production',
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
      // The run id is the key into the Apify console's usage and cost view.
      this.loggerService.log(
        `${this.constructorName} started Apify run ${runId}`,
        { actorId, caller, runId, scope },
      );

      const completedRun = await this.waitForRun(runId, token);
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
   * Log a failed Apify call. An account-limit refusal or a held-off call is
   * not a bug in the caller, so it gets one line without a stack trace; the
   * suspension itself was already announced once by `recordAccountLimit`.
   */
  logFailure(label: string, error: unknown): void {
    if (error instanceof ApifyAccountSuspendedException) {
      this.loggerService.debug(`${label} skipped: ${error.message}`);
      return;
    }

    if (isApifyAccountLimitError(error)) {
      this.loggerService.warn(
        `${label} (Apify refused the call: ${describeApifyError(error)})`,
      );
      return;
    }

    this.loggerService.error(label, error);
  }

  async assertCollectionAdmission(scope: string): Promise<void> {
    const suspension =
      this.getActiveAccountLimitSuspension(scope) ??
      (await this.readSharedSuspension(scope));
    if (suspension) throw this.buildAccountLimitException(suspension);
  }

  recordCollectionFailure(
    scope: string,
    actorId: string,
    error: unknown,
  ): void {
    if (isApifyAccountLimitError(error))
      this.recordAccountLimit(scope, actorId, error);
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

    const suspension = {
      reason: describeApifyError(error),
      suspendedUntilMs,
    };
    this.accountLimitSuspensions.set(scope, suspension);
    void this.shareSuspension(scope, suspension);
    void this.alertOperators(scope, suspension);

    this.loggerService.error(
      `${this.constructorName} Apify rejected ${actorId} for the "${scope}" token — ${describeApifyError(error)}. Apify calls on this token are suspended until ${new Date(suspendedUntilMs).toISOString()}; raise the account usage limit or upgrade the plan to restore scraping.`,
      undefined,
      { actorId, scope, suspendedUntilMs },
    );
  }

  private buildAccountLimitException(
    suspension: ApifyAccountLimitSuspension,
  ): ApifyAccountSuspendedException {
    return new ApifyAccountSuspendedException(
      suspension.reason,
      suspension.suspendedUntilMs,
    );
  }

  /**
   * Publish the suspension so a restarted or sibling process skips the probe
   * call instead of finding out with its own 403.
   */
  private async shareSuspension(
    scope: string,
    suspension: ApifyAccountLimitSuspension,
  ): Promise<void> {
    if (!this.cacheService) return;
    const ttl = Math.max(
      1,
      Math.ceil((suspension.suspendedUntilMs - Date.now()) / 1000),
    );
    await this.cacheService.set(
      `${ApifyBaseService.SUSPENSION_CACHE_PREFIX}${scope}`,
      suspension,
      { ttl },
    );
  }

  private async readSharedSuspension(
    scope: string,
  ): Promise<ApifyAccountLimitSuspension | null> {
    if (!this.cacheService) return null;
    const shared = await this.cacheService.get<ApifyAccountLimitSuspension>(
      `${ApifyBaseService.SUSPENSION_CACHE_PREFIX}${scope}`,
    );
    if (!shared || shared.suspendedUntilMs <= Date.now()) return null;
    this.accountLimitSuspensions.set(scope, shared);
    return shared;
  }

  /**
   * One operator alert naming Apify as the cause. Only the hosted token pages
   * operators: an exhausted BYOK account is the customer's to fix. The
   * deduplication key buckets by window, so every process and the 15 minute
   * re-probe collapse into a single alert per window.
   */
  private async alertOperators(
    scope: string,
    suspension: ApifyAccountLimitSuspension,
  ): Promise<void> {
    if (scope !== ApifyBaseService.HOSTED_SCOPE || !this.activityRecorder) {
      return;
    }

    const now = Date.now();
    const window = Math.floor(now / ApifyBaseService.ALERT_WINDOW_MS);
    try {
      await this.activityRecorder.dispatch({
        deduplicationKey: `apify-account-limit/hosted/${window}`,
        messages: [
          {
            destination: null,
            message: {
              action: 'ingestion_health',
              payload: {
                card: {
                  color: 0xef4444,
                  description: `Apify rejected the hosted token (${suspension.reason}). Trends, reply-bot X search, warm-up research and the Instagram/TikTok scrapers are paused and retry from ${new Date(suspension.suspendedUntilMs).toISOString()}. Raise the monthly usage limit or upgrade the plan in the Apify console (Billing).`,
                  title: 'Apify is out of budget',
                },
              },
              type: 'discord',
            },
          },
        ],
        occurredAt: new Date(now),
        organizationId: null,
        source: { id: 'hosted', type: 'apify_account_limit' },
        topic: 'operator.alerts',
      });
    } catch (alertError: unknown) {
      this.loggerService.warn(
        `${this.constructorName} could not send the Apify out-of-budget alert: ${describeApifyError(alertError)}`,
      );
    }
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

  buildActorRunUrl(actorId: string): string {
    return `${this.apiUrl}/acts/${this.normalizeActorId(actorId)}/runs`;
  }

  normalizeActorId(actorId: string): string {
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
    const match = duration.match(ISO8601_DURATION_PATTERN);
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
