import {
  // Social
  allSocialSchema,
  awsSchema,
  BaseConfigService,
  // Base
  baseSchema,
  clerkSchema,
  conditionalRequired,
  darkroomSchema,
  elevenlabsSchema,
  falSchema,
  // AI
  generalAiSchema,
  // Genfeed
  genfeedaiUrlsSchema,
  hedraSchema,
  heygenSchema,
  type IEnvConfig,
  internalAuthSchema,
  klingaiSchema,
  leonardoSchema,
  microservicesSchema,
  // Infrastructure
  mongodbSchema,
  newsApiSchema,
  redisSchema,
  replicateSchema,
  sentrySchema,
  stripeSchema,
  trainingPricingSchema,
  webhooksSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

interface ApiEnvConfig extends IEnvConfig {
  CONTENT_HARNESS_PACKAGES?: string;
  FEATURE_FLAG_DEFAULTS?: string;
  GF_DEV_ENABLE_OPTIONAL_INIT?: 'true' | 'false';
  GF_DEV_ENABLE_SCHEDULERS?: 'true' | 'false';
  GF_DEV_ENABLE_TELEGRAM_POLLING?: 'true' | 'false';
  GROWTHBOOK_API_HOST?: string;
  GROWTHBOOK_CLIENT_KEY?: string;
  MARKETPLACE_API_URL?: string;
}

/**
 * API-specific env vars that aren't in shared schemas
 */
const apiSpecificSchema = {
  API_METRICS_LOGGING: Joi.string().valid('true', 'false').optional().allow(''),
  CONTENT_HARNESS_PACKAGES: Joi.string().optional().allow(''),
  FEATURE_FLAG_DEFAULTS: Joi.string().optional().allow(''),
  GF_DEV_ENABLE_OPTIONAL_INIT: Joi.string()
    .valid('true', 'false')
    .optional()
    .allow(''),
  GF_DEV_ENABLE_SCHEDULERS: Joi.string()
    .valid('true', 'false')
    .optional()
    .allow(''),
  GF_DEV_ENABLE_TELEGRAM_POLLING: Joi.string()
    .valid('true', 'false')
    .optional()
    .allow(''),
  GROWTHBOOK_API_HOST: Joi.string().uri().optional().allow(''),
  GROWTHBOOK_CLIENT_KEY: Joi.string().optional().allow(''),
  // Marketplace (extracted service)
  MARKETPLACE_API_URL: Joi.string()
    .uri()
    .optional()
    .default('http://localhost:3200'),
  // Solana (optional)
  SOLANA_KEY: Joi.string().optional().allow(''),
  SOLANA_URL: Joi.string().optional().allow(''),
};

/**
 * Combined schema for API service
 */
const apiSchema = Joi.object({
  ...baseSchema,
  ...mongodbSchema,
  ...redisSchema,
  ...awsSchema,
  ...clerkSchema,
  ...sentrySchema,
  ...stripeSchema,
  ...webhooksSchema,
  ...genfeedaiUrlsSchema,
  ...microservicesSchema,
  ...internalAuthSchema,
  ...generalAiSchema,
  ...replicateSchema,
  ...falSchema,
  ...klingaiSchema,
  ...elevenlabsSchema,
  ...leonardoSchema,
  ...heygenSchema,
  ...hedraSchema,
  ...newsApiSchema,
  ...darkroomSchema,
  ...trainingPricingSchema,
  ...allSocialSchema,
  ...apiSpecificSchema,
  ELEVENLABS_API_KEY: conditionalRequired(),
});

@Injectable()
export class ConfigService extends BaseConfigService<ApiEnvConfig> {
  constructor() {
    super(apiSchema, {
      appName: 'api',
      workingDir: 'apps/server',
    });
  }

  public get isDevOptionalInitEnabled(): boolean {
    return this.isLocalDevFlagEnabled('GF_DEV_ENABLE_OPTIONAL_INIT');
  }

  public get isDevSchedulersEnabled(): boolean {
    return this.isLocalDevFlagEnabled('GF_DEV_ENABLE_SCHEDULERS');
  }

  public get isDevTelegramPollingEnabled(): boolean {
    return this.isLocalDevFlagEnabled('GF_DEV_ENABLE_TELEGRAM_POLLING');
  }

  /**
   * Get the ingredients CDN endpoint
   */
  public get ingredientsEndpoint(): string {
    return `${this.envConfig.GENFEEDAI_CDN_URL}/ingredients`;
  }

  private isLocalDevFlagEnabled(
    key:
      | 'GF_DEV_ENABLE_OPTIONAL_INIT'
      | 'GF_DEV_ENABLE_SCHEDULERS'
      | 'GF_DEV_ENABLE_TELEGRAM_POLLING',
  ): boolean {
    if (!this.isDevelopment) {
      return true;
    }

    return String(this.get(key) ?? '').toLowerCase() === 'true';
  }
}
