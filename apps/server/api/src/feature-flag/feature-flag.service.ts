import { ConfigService } from '@api/config/config.service';
import {
  type Attributes,
  GrowthBookClient,
  type UserContext,
} from '@growthbook/growthbook';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

export type FeatureFlagAttributes = Attributes;

@Injectable()
export class FeatureFlagService implements OnModuleDestroy, OnModuleInit {
  private static readonly DEFAULT_REFRESH_INTERVAL_MS = 60_000;

  private client: GrowthBookClient | null = null;
  private localDefaults: Record<string, unknown> = {};
  private refreshIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  onModuleDestroy(): void {
    this.stopAutoRefresh();
    this.destroyClient();
  }

  async init(): Promise<void> {
    this.stopAutoRefresh();
    this.destroyClient();
    this.localDefaults = this.parseLocalDefaults();

    const apiHost = String(this.configService.get('GROWTHBOOK_API_HOST') || '');
    const clientKey = String(
      this.configService.get('GROWTHBOOK_CLIENT_KEY') || '',
    );

    if (!apiHost || !clientKey) {
      this.loggerService.warn(
        'GrowthBook remote flags disabled; using local feature flag defaults only',
        {
          hasApiHost: Boolean(apiHost),
          hasClientKey: Boolean(clientKey),
          localDefaultCount: Object.keys(this.localDefaults).length,
        },
      );
      return;
    }

    this.client = new GrowthBookClient({
      apiHost,
      clientKey,
      debug: this.configService.isDevelopment,
      log: (message, context) => {
        this.loggerService.debug(`GrowthBook: ${message}`, context);
      },
    });

    await this.refreshFeatures('initial');
    this.startAutoRefresh();
  }

  isEnabled(flagKey: string, attributes?: FeatureFlagAttributes): boolean {
    const client = this.client;

    if (!client) {
      const fallbackValue = this.getLocalDefault(flagKey);
      const enabled = fallbackValue === true;
      this.logEvaluation(flagKey, enabled, 'localDefault', attributes);
      return enabled;
    }

    const result = client.evalFeature(flagKey, this.toUserContext(attributes));
    this.logEvaluation(flagKey, result.on, result.source, attributes);

    return result.on;
  }

  getFeatureValue<T>(
    flagKey: string,
    defaultValue: T,
    attributes?: FeatureFlagAttributes,
  ): T {
    const client = this.client;

    if (!client) {
      const fallbackValue = this.getLocalDefault(flagKey);
      const resolvedValue =
        fallbackValue === undefined ? defaultValue : (fallbackValue as T);
      this.logEvaluation(
        flagKey,
        Boolean(resolvedValue),
        fallbackValue === undefined ? 'localDefaultMissing' : 'localDefault',
        attributes,
      );
      return resolvedValue;
    }

    const result = client.evalFeature<T>(
      flagKey,
      this.toUserContext(attributes),
    );
    this.logEvaluation(flagKey, result.on, result.source, attributes);

    return result.value === null ? defaultValue : result.value;
  }

  private async refreshFeatures(reason: 'auto' | 'initial'): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      if (reason === 'initial') {
        const response = await this.client.init({ streaming: false });
        this.loggerService.debug('GrowthBook feature payload initialized', {
          source: response.source,
          success: response.success,
        });
        return;
      }

      await this.client.refreshFeatures();
      this.loggerService.debug('GrowthBook feature payload refreshed', {
        reason,
      });
    } catch (error) {
      this.loggerService.warn(
        'GrowthBook refresh failed; feature flags default to off until the next successful refresh',
        {
          error,
          reason,
        },
      );
    }
  }

  private startAutoRefresh(): void {
    this.refreshIntervalId = setInterval(() => {
      void this.refreshFeatures('auto');
    }, FeatureFlagService.DEFAULT_REFRESH_INTERVAL_MS);
  }

  private stopAutoRefresh(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }

  private destroyClient(): void {
    this.client?.destroy({ destroyAllStreams: true });
    this.client = null;
  }

  private getLocalDefault(flagKey: string): unknown {
    return this.localDefaults[flagKey];
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

  private toUserContext(attributes?: FeatureFlagAttributes): UserContext {
    return attributes ? { attributes } : {};
  }

  private logEvaluation(
    flagKey: string,
    enabled: boolean,
    source: string,
    attributes?: FeatureFlagAttributes,
  ): void {
    this.loggerService.debug('GrowthBook feature evaluated', {
      enabled,
      flagKey,
      hasAttributes: Boolean(attributes && Object.keys(attributes).length > 0),
      source,
    });
  }
}
