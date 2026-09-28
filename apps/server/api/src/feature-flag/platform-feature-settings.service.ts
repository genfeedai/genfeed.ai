import { PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS } from '@api/feature-flag/feature-flag.constants';
import { PostHogFeatureFlagEvaluator } from '@api/feature-flag/posthog-feature-flag.evaluator';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  PLATFORM_FEATURE_FLAG_KEYS,
  platformFeatureSettingsFromFlags,
  SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
} from '@genfeedai/contracts/constants';
import type { IPlatformFeatureSettings } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type FeatureSettingsCacheEntry = {
  expiresAtMs: number;
  value: IPlatformFeatureSettings;
};

/**
 * The product feature switches (#5407), served from PostHog feature flags
 * (#5468) — see `PLATFORM_FEATURE_FLAG_KEYS`.
 *
 * One `/flags` request per process per TTL answers every switch, so hot paths
 * (every agent tool result, every auth request, every publish assessment) cost
 * no network call, and a flag edit reaches every API and workers process
 * within {@link PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS}. Workers sweeps call
 * this on every tick. The first read happens on first use, never during boot,
 * so PostHog latency cannot delay readiness.
 *
 * - No PostHog (Community, Desktop, self-hosted): the code defaults, with no
 *   network call.
 * - PostHog answered: PostHog is authoritative — an omitted flag is off,
 *   because PostHog omits inactive flags. An answer with no platform flag at
 *   all (not migrated) serves the conservative SaaS profile instead.
 * - PostHog unanswered: the last known switches for one more TTL; before any
 *   answer, the conservative SaaS profile, uncached, so the next call asks
 *   again rather than serving a guess for a whole TTL.
 */
@Injectable()
export class PlatformFeatureSettingsService {
  private cache: FeatureSettingsCacheEntry | undefined;
  private pending: Promise<IPlatformFeatureSettings> | undefined;

  constructor(
    private readonly evaluator: PostHogFeatureFlagEvaluator,
    private readonly logger: LoggerService,
  ) {}

  async getFeatureSettings(): Promise<IPlatformFeatureSettings> {
    const cached = this.cache;
    if (cached && Date.now() < cached.expiresAtMs) {
      return cached.value;
    }

    this.pending ??= this.load().finally(() => {
      this.pending = undefined;
    });

    return this.pending;
  }

  private async load(): Promise<IPlatformFeatureSettings> {
    if (!this.evaluator.isConfigured()) {
      return this.store(DEFAULT_PLATFORM_FEATURE_SETTINGS);
    }

    const flags = await this.evaluator.evaluatePlatformFlags();
    if (flags && hasPlatformFlag(flags)) {
      return this.store(platformFeatureSettingsFromFlags(flags));
    }
    if (flags) {
      // PostHog answered, but with none of the platform flags: they are not
      // migrated yet (or were deleted). Treating that as "everything off"
      // would disable email verification, so keep production's posture.
      this.logger.warn(
        'PostHog answered without any platform feature flag; serving the conservative SaaS switches',
      );
      return this.store(SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS);
    }

    const lastKnown = this.cache?.value;
    this.logger.warn(
      'PostHog did not answer the platform feature flags; keeping the last known switches',
      { hasLastKnownSwitches: Boolean(lastKnown) },
    );
    return lastKnown
      ? this.store(lastKnown)
      : SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS;
  }

  private store(value: IPlatformFeatureSettings): IPlatformFeatureSettings {
    this.cache = {
      expiresAtMs: Date.now() + PLATFORM_FEATURE_SETTINGS_CACHE_TTL_MS,
      value,
    };
    return value;
  }
}

function hasPlatformFlag(flags: Readonly<Record<string, unknown>>): boolean {
  return Object.values(PLATFORM_FEATURE_FLAG_KEYS).some((key) =>
    Object.hasOwn(flags, key),
  );
}
