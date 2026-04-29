import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export type FeatureFlagAttributes = Record<string, unknown>;

@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private localDefaults: Record<string, unknown> = {};

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  async init(): Promise<void> {
    this.localDefaults = this.parseLocalDefaults();

    this.loggerService.debug(
      'Feature flags initialized with local defaults only',
      {
        localDefaultCount: Object.keys(this.localDefaults).length,
      },
    );
  }

  isEnabled(flagKey: string, _attributes?: FeatureFlagAttributes): boolean {
    const value = this.localDefaults[flagKey];
    const enabled = value === true;

    this.loggerService.debug('Feature flag evaluated', {
      enabled,
      flagKey,
      source: 'localDefault',
    });

    return enabled;
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

  private parseLocalDefaults(): Record<string, unknown> {
    const rawDefaults = String(
      this.configService.get('FEATURE_FLAG_DEFAULTS') || '',
    );

    if (!rawDefaults) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawDefaults) as unknown;

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('FEATURE_FLAG_DEFAULTS must be a JSON object');
      }

      return parsed as Record<string, unknown>;
    } catch (error) {
      this.loggerService.warn(
        'Failed to parse FEATURE_FLAG_DEFAULTS; ignoring local feature flag defaults',
        { error },
      );
      return {};
    }
  }
}
