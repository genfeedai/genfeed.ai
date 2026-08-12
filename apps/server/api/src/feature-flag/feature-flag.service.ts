import type { FeatureFlagAttributes } from '@api/feature-flag/feature-flag.types';
import { PostHogFeatureFlagEvaluator } from '@api/feature-flag/posthog-feature-flag.evaluator';
import { isSaaS } from '@genfeedai/config/deployment';
import { REPLY_BOT_FEATURE_FLAG } from '@genfeedai/constants';
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
}

const REPLY_BOT_CACHE_TTL_MS = 30_000;

@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private isLocalDefaultsConfigured = false;
  private localDefaults: Record<string, unknown> = {};
  private readonly replyBotDecisions = new Map<
    string,
    CachedFeatureFlagDecision
  >();
  private readonly replyBotFreshUntil = new Map<string, number>();

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
    const freshUntil = this.replyBotFreshUntil.get(cacheKey) ?? 0;
    if (cached && freshUntil > Date.now()) {
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

    const remoteEnabled = await this.postHogFeatureFlagEvaluator.isEnabled(
      REPLY_BOT_FEATURE_FLAG,
      attributes,
    );

    if (typeof remoteEnabled === 'boolean') {
      this.replyBotDecisions.set(cacheKey, { enabled: remoteEnabled });
      this.replyBotFreshUntil.set(
        cacheKey,
        Date.now() + REPLY_BOT_CACHE_TTL_MS,
      );
      this.loggerService.debug('Feature flag evaluated', {
        flagKey: REPLY_BOT_FEATURE_FLAG,
        isEnabled: remoteEnabled,
        source: 'posthog',
      });
      return remoteEnabled;
    }

    if (cached) {
      this.loggerService.debug('Feature flag evaluated', {
        flagKey: REPLY_BOT_FEATURE_FLAG,
        isEnabled: cached.enabled,
        source: 'posthogCachedFallback',
      });
      return cached.enabled;
    }

    this.loggerService.debug('Feature flag evaluated', {
      flagKey: REPLY_BOT_FEATURE_FLAG,
      isEnabled: true,
      source: 'posthogFailOpen',
    });
    return true;
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
