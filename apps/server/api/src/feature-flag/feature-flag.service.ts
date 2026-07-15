import {
  CONVERSATION_SHELL_FLAG_KEY,
  type ConversationShellClientSurface,
  type ConversationShellDeployment,
  type ConversationShellEvaluation,
  type ConversationShellEvaluationAttributes,
  type ConversationShellRolloutConfigParseResult,
  evaluateConversationShellRollout,
  parseConversationShellRolloutConfig,
} from '@genfeedai/config/conversation-shell-rollout';
import { getDeployment } from '@genfeedai/config/deployment';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export type FeatureFlagAttributes = Record<string, unknown>;

export interface ConversationShellEvaluationInput {
  readonly client?: unknown;
  readonly organizationId?: unknown;
}

interface ParsedFeatureFlagDefaults {
  defaults: Record<string, unknown>;
  isConfigured: boolean;
}

@Injectable()
export class FeatureFlagService implements OnModuleInit {
  private conversationShellConfig: ConversationShellRolloutConfigParseResult = {
    config: null,
    error: 'missing_configuration',
  };
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
    this.conversationShellConfig = parseConversationShellRolloutConfig(
      this.localDefaults[CONVERSATION_SHELL_FLAG_KEY],
    );

    if (this.conversationShellConfig.error === 'invalid_configuration') {
      this.loggerService.warn(
        'Conversation shell rollout configuration is invalid; evaluation will fail closed',
        { reason: this.conversationShellConfig.error },
      );
    }

    this.loggerService.debug(
      'Feature flags initialized with local defaults only',
      {
        conversationShellConfiguration:
          this.conversationShellConfig.error ?? 'valid',
        isConfigured: this.isLocalDefaultsConfigured,
        localDefaultCount: Object.keys(this.localDefaults).length,
      },
    );
  }

  isEnabled(flagKey: string, _attributes?: FeatureFlagAttributes): boolean {
    if (flagKey === CONVERSATION_SHELL_FLAG_KEY) {
      return this.evaluateConversationShell({
        client: _attributes?.client,
        organizationId: _attributes?.organizationId,
      }).enabled;
    }

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

  evaluateConversationShell(
    input: ConversationShellEvaluationInput,
  ): ConversationShellEvaluation {
    const deployment = getDeployment() satisfies ConversationShellDeployment;
    const client = this.parseConversationShellClient(input.client);
    const organizationId =
      typeof input.organizationId === 'string'
        ? input.organizationId.trim()
        : '';
    const attributes: ConversationShellEvaluationAttributes = {
      client: client ?? 'web',
      deployment,
      organizationId: client ? organizationId : '',
    };
    const evaluation = evaluateConversationShellRollout(
      this.conversationShellConfig,
      attributes,
    );

    this.loggerService.debug('Conversation shell flag evaluated', {
      cohort: evaluation.cohort,
      configVersion: evaluation.configVersion,
      deploymentMode: evaluation.deploymentMode,
      enabled: evaluation.enabled,
      reason: evaluation.reason,
      rollbackRevision: evaluation.rollbackRevision,
    });

    return evaluation;
  }

  private parseConversationShellClient(
    value: unknown,
  ): ConversationShellClientSurface | null {
    return value === 'desktop' || value === 'web' ? value : null;
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
