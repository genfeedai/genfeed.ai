import type { FeatureFlagAttributes } from '@api/feature-flag/feature-flag.types';
import { PostHogFeatureFlagEvaluator } from '@api/feature-flag/posthog-feature-flag.evaluator';
import { isSaaS } from '@genfeedai/config/deployment';
import { REPLY_BOT_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';

export type { FeatureFlagAttributes } from '@api/feature-flag/feature-flag.types';

interface ParsedFeatureFlagDefaults {
  defaults: Record<string, unknown>;
  isConfigured: boolean;
}

interface CachedFeatureFlagDecision {
  enabled: boolean;
  freshUntil: number;
}

const REPLY_BOT_CACHE_TTL_MS = 30_000;
// Hard cap so per-user decisions cannot grow the map unboundedly; entries are
// kept in recency order (Map insertion order) and the oldest one is evicted.
const REPLY_BOT_CACHE_MAX_ENTRIES = 1_000;

@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private isLocalDefaultsConfigured = false;
  private localDefaults: Record<string, unknown> = {};
  private readonly replyBotDecisions = new Map<
    string,
    CachedFeatureFlagDecision
  >();
  private readonly replyBotRefreshes = new Map<
    string,
    Promise<boolean | undefined>
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly postHogFeatureFlagEvaluator?: PostHogFeatureFlagEvaluator,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  async init(): Promise<void> {
    const parsedDefaults = this.parseLocalDefaults();
    this.localDefaults = parsedDefaults.defaults;
    this.isLocalDefaultsConfigured = parsedDefaults.isConfigured;

    this.loggerService.debug(
      'Feature flags initialized with local defaults only',
      {
        isConfigured: this.isLocalDefaultsConfigured,
        localDefaultCount: Object.keys(this.localDefaults).length,
      },
    );
  }

  async isEnabled(
    flagKey: string,
    attributes?: FeatureFlagAttributes,
  ): Promise<boolean> {
    if (flagKey === REPLY_BOT_FEATURE_FLAG) {
      return this.isReplyBotEnabled(attributes);
    }

    return this.isLocalDefaultEnabled(flagKey);
  }

  getFeatureValue<T>(
    flagKey: string,
    defaultValue: T,
    _attributes?: FeatureFlagAttributes,
  ): T {
    const value = this.localDefaults[flagKey];
    const resolvedValue = value === undefined ? defaultValue : (value as T);

    this.loggerService.debug('Feature flag evaluated', {
      flagKey,
      hasValue: value !== undefined,
      source: value === undefined ? 'localDefaultMissing' : 'localDefault',
    });

    return resolvedValue;
  }

  private async isReplyBotEnabled(
    attributes?: FeatureFlagAttributes,
  ): Promise<boolean> {
    if (!isSaaS()) {
      this.loggerService.debug('Feature flag evaluated', {
        flagKey: REPLY_BOT_FEATURE_FLAG,
        isEnabled: true,
        source: 'communityDefault',
      });
      return true;
    }

    const cacheKey = replyBotCacheKey(attributes);
    const cached = this.replyBotDecisions.get(cacheKey);
    if (cached && cached.freshUntil > Date.now()) {
      this.touchReplyBotDecision(cacheKey, cached);
      this.loggerService.debug('Feature flag evaluated', {
        flagKey: REPLY_BOT_FEATURE_FLAG,
        isEnabled: cached.enabled,
        source: 'posthogCache',
      });
      return cached.enabled;
    }

    if (!this.postHogFeatureFlagEvaluator?.isConfigured()) {
      this.loggerService.debug('Feature flag evaluated', {
        flagKey: REPLY_BOT_FEATURE_FLAG,
        isEnabled: true,
        source: 'posthogAbsent',
      });
      return true;
    }

    if (cached) {
      // Stale-while-revalidate: serve the last known decision without
      // blocking the request; the refresh replaces the entry when it lands.
      void this.refreshReplyBotDecision(cacheKey, attributes);
      this.touchReplyBotDecision(cacheKey, cached);
      this.loggerService.debug('Feature flag evaluated', {
        flagKey: REPLY_BOT_FEATURE_FLAG,
        isEnabled: cached.enabled,
        source: 'posthogStaleWhileRevalidate',
      });
      return cached.enabled;
    }

    const remoteEnabled = await this.refreshReplyBotDecision(
      cacheKey,
      attributes,
    );

    if (typeof remoteEnabled === 'boolean') {
      this.loggerService.debug('Feature flag evaluated', {
        flagKey: REPLY_BOT_FEATURE_FLAG,
        isEnabled: remoteEnabled,
        source: 'posthog',
      });
      return remoteEnabled;
    }

    this.loggerService.debug('Feature flag evaluated', {
      flagKey: REPLY_BOT_FEATURE_FLAG,
      isEnabled: true,
      source: 'posthogFailOpen',
    });
    return true;
  }

  /**
   * Fetch the remote decision once per cache key at a time; concurrent
   * callers share the same in-flight request. A boolean result replaces the
   * cached entry; `undefined` (PostHog unreachable) keeps the stale entry as
   * the fallback.
   */
  private refreshReplyBotDecision(
    cacheKey: string,
    attributes?: FeatureFlagAttributes,
  ): Promise<boolean | undefined> {
    const inFlight = this.replyBotRefreshes.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refresh = (async (): Promise<boolean | undefined> => {
      try {
        const remoteEnabled = await this.postHogFeatureFlagEvaluator?.isEnabled(
          REPLY_BOT_FEATURE_FLAG,
          attributes,
        );
        if (typeof remoteEnabled === 'boolean') {
          this.storeReplyBotDecision(cacheKey, remoteEnabled);
        }
        return remoteEnabled;
      } catch (error) {
        this.loggerService.warn('Reply-bot feature flag refresh failed', {
          error,
        });
        return undefined;
      } finally {
        this.replyBotRefreshes.delete(cacheKey);
      }
    })();

    this.replyBotRefreshes.set(cacheKey, refresh);
    return refresh;
  }

  private storeReplyBotDecision(cacheKey: string, enabled: boolean): void {
    this.replyBotDecisions.delete(cacheKey);
    this.replyBotDecisions.set(cacheKey, {
      enabled,
      freshUntil: Date.now() + REPLY_BOT_CACHE_TTL_MS,
    });
    if (this.replyBotDecisions.size > REPLY_BOT_CACHE_MAX_ENTRIES) {
      const oldestKey = this.replyBotDecisions.keys().next().value;
      if (oldestKey !== undefined) {
        this.replyBotDecisions.delete(oldestKey);
      }
    }
  }

  /** Move a hit to the back of the map so eviction drops the coldest key. */
  private touchReplyBotDecision(
    cacheKey: string,
    entry: CachedFeatureFlagDecision,
  ): void {
    this.replyBotDecisions.delete(cacheKey);
    this.replyBotDecisions.set(cacheKey, entry);
  }

  private isLocalDefaultEnabled(flagKey: string): boolean {
    if (!this.isLocalDefaultsConfigured) {
      this.loggerService.debug('Feature flag evaluated', {
        flagKey,
        isEnabled: true,
        source: 'localDefaultsMissing',
      });

      return true;
    }

    const value = this.localDefaults[flagKey];
    const isEnabled = value === true;

    this.loggerService.debug('Feature flag evaluated', {
      flagKey,
      isEnabled,
      source: 'localDefault',
    });

    return isEnabled;
  }

  private parseLocalDefaults(): ParsedFeatureFlagDefaults {
    const rawDefaults = String(
      this.configService.get('FEATURE_FLAG_DEFAULTS') || '',
    ).trim();

    if (!rawDefaults) {
      return { defaults: {}, isConfigured: false };
    }

    try {
      const parsed = JSON.parse(rawDefaults) as unknown;

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('FEATURE_FLAG_DEFAULTS must be a JSON object');
      }

      return {
        defaults: parsed as Record<string, unknown>,
        isConfigured: true,
      };
    } catch (error) {
      this.loggerService.warn(
        'Failed to parse FEATURE_FLAG_DEFAULTS; feature flags will fail closed',
        { error },
      );
      return { defaults: {}, isConfigured: true };
    }
  }
}

function replyBotCacheKey(attributes?: FeatureFlagAttributes): string {
  const id = attributes?.id;
  return typeof id === 'string' && id.trim() !== '' ? id : 'anonymous';
}
