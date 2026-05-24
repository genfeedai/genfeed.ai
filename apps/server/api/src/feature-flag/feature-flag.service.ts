import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export type FeatureFlagAttributes = Record<string, unknown>;

interface ParsedFeatureFlagDefaults {
  defaults: Record<string, unknown>;
  isConfigured: boolean;
}

@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private isLocalDefaultsConfigured = false;
  private localDefaults: Record<string, unknown> = {};

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
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

  isEnabled(flagKey: string, _attributes?: FeatureFlagAttributes): boolean {
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
