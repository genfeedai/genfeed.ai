import type { FeatureFlagAttributes } from '@api/feature-flag/feature-flag.types';
import { PostHogFeatureFlagEvaluator } from '@api/feature-flag/posthog-feature-flag.evaluator';
import { isSaaS } from '@genfeedai/config/deployment';
import { FEATURE_FLAG_OFFLINE_DEFAULTS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

export type { FeatureFlagAttributes } from '@api/feature-flag/feature-flag.types';

interface CachedFeatureFlagDecision {
  enabled: boolean;
  freshUntil: number;
}

const FEATURE_FLAG_CACHE_TTL_MS = 30_000;
// Hard cap so per-user decisions cannot grow the map unboundedly; entries are
// kept in recency order (Map insertion order) and the oldest one is evicted.
const FEATURE_FLAG_CACHE_MAX_ENTRIES = 1_000;

/**
 * Per-user product flags, evaluated in PostHog on SaaS (#5468).
 *
 * Without PostHog (Community, Desktop, self-hosted) — or when PostHog does not
 * answer and nothing is cached — a flag resolves to its typed default in
 * `FEATURE_FLAG_OFFLINE_DEFAULTS` (unknown keys are off). There is no env JSON
 * of flag values: PostHog is the only place a flag is changed.
 */
@Injectable()
export class FeatureFlagService {
  private readonly decisions = new Map<string, CachedFeatureFlagDecision>();
  private readonly refreshes = new Map<string, Promise<boolean | undefined>>();

  constructor(
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly postHogFeatureFlagEvaluator?: PostHogFeatureFlagEvaluator,
  ) {}

  async isEnabled(
    flagKey: string,
    attributes?: FeatureFlagAttributes,
  ): Promise<boolean> {
    const offlineDefault = FEATURE_FLAG_OFFLINE_DEFAULTS[flagKey] ?? false;

    if (!isSaaS()) {
      this.logDecision(flagKey, offlineDefault, 'communityDefault');
      return offlineDefault;
    }

    const cacheKey = decisionCacheKey(flagKey, attributes);
    const cached = this.decisions.get(cacheKey);
    if (cached && cached.freshUntil > Date.now()) {
      this.touchDecision(cacheKey, cached);
      this.logDecision(flagKey, cached.enabled, 'posthogCache');
      return cached.enabled;
    }

    if (!this.postHogFeatureFlagEvaluator?.isConfigured()) {
      this.logDecision(flagKey, offlineDefault, 'posthogAbsent');
      return offlineDefault;
    }

    if (cached) {
      // Stale-while-revalidate: serve the last known decision without
      // blocking the request; the refresh replaces the entry when it lands.
      void this.refreshDecision(cacheKey, flagKey, attributes);
      this.touchDecision(cacheKey, cached);
      this.logDecision(flagKey, cached.enabled, 'posthogStaleWhileRevalidate');
      return cached.enabled;
    }

    const remoteEnabled = await this.refreshDecision(
      cacheKey,
      flagKey,
      attributes,
    );
    if (typeof remoteEnabled === 'boolean') {
      this.logDecision(flagKey, remoteEnabled, 'posthog');
      return remoteEnabled;
    }

    this.logDecision(flagKey, offlineDefault, 'posthogUnanswered');
    return offlineDefault;
  }

  /**
   * Fetch the remote decision once per cache key at a time; concurrent
   * callers share the same in-flight request. A boolean result replaces the
   * cached entry; `undefined` (PostHog unreachable) keeps the stale entry as
   * the fallback.
   */
  private refreshDecision(
    cacheKey: string,
    flagKey: string,
    attributes?: FeatureFlagAttributes,
  ): Promise<boolean | undefined> {
    const inFlight = this.refreshes.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refresh = (async (): Promise<boolean | undefined> => {
      try {
        const remoteEnabled = await this.postHogFeatureFlagEvaluator?.isEnabled(
          flagKey,
          attributes,
        );
        if (typeof remoteEnabled === 'boolean') {
          this.storeDecision(cacheKey, remoteEnabled);
        }
        return remoteEnabled;
      } catch (error) {
        this.loggerService.warn('Feature flag refresh failed', {
          error,
          flagKey,
        });
        return undefined;
      } finally {
        this.refreshes.delete(cacheKey);
      }
    })();

    this.refreshes.set(cacheKey, refresh);
    return refresh;
  }

  private storeDecision(cacheKey: string, enabled: boolean): void {
    this.decisions.delete(cacheKey);
    this.decisions.set(cacheKey, {
      enabled,
      freshUntil: Date.now() + FEATURE_FLAG_CACHE_TTL_MS,
    });
    if (this.decisions.size > FEATURE_FLAG_CACHE_MAX_ENTRIES) {
      const oldestKey = this.decisions.keys().next().value;
      if (oldestKey !== undefined) {
        this.decisions.delete(oldestKey);
      }
    }
  }

  /** Move a hit to the back of the map so eviction drops the coldest key. */
  private touchDecision(
    cacheKey: string,
    entry: CachedFeatureFlagDecision,
  ): void {
    this.decisions.delete(cacheKey);
    this.decisions.set(cacheKey, entry);
  }

  private logDecision(flagKey: string, isEnabled: boolean, source: string) {
    this.loggerService.debug('Feature flag evaluated', {
      flagKey,
      isEnabled,
      source,
    });
  }
}

function decisionCacheKey(
  flagKey: string,
  attributes?: FeatureFlagAttributes,
): string {
  const id = attributes?.id;
  return `${flagKey}:${typeof id === 'string' && id.trim() !== '' ? id : 'anonymous'}`;
}
