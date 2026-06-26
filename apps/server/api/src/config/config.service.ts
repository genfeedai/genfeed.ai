import {
  // Social
  allSocialSchema,
  awsSchema,
  BaseConfigService,
  // Base
  baseSchema,
  betterAuthSchema,
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
  newsApiSchema,
  opusProSchema,
  postgresSchema,
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
  BETTER_AUTH_ENABLED?: 'true' | 'false';
  BETTER_AUTH_API_KEY?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  API_PERFORMANCE_AUDIT?: 'true' | 'false';
  API_QUERY_METRICS?: 'true' | 'false';
  API_SENTRY_PERFORMANCE_METRICS?: 'true' | 'false';
  API_SLOW_QUERY_SAMPLE_SIZE?: string;
  API_SLOW_QUERY_THRESHOLD_MS?: string;
  CONTENT_HARNESS_PACKAGES?: string;
  FEATURE_FLAG_DEFAULTS?: string;
  GF_DEV_ENABLE_OPTIONAL_INIT?: 'true' | 'false';
  GF_DEV_ENABLE_SCHEDULERS?: 'true' | 'false';
  GF_DEV_ENABLE_TELEGRAM_POLLING?: 'true' | 'false';
  MARKETPLACE_API_URL?: string;
  PGSSLROOTCERT?: string;
  PRISMA_POSTGRES_CA_FILE?: string;
  npm_package_description?: string;
  npm_package_version?: string;
}

/**
 * API-specific env vars that aren't in shared schemas
 */
const apiSpecificSchema = {
  API_METRICS_LOGGING: Joi.string().valid('true', 'false').optional().allow(''),
  API_PERFORMANCE_AUDIT: Joi.string()
    .valid('true', 'false')
    .optional()
    .allow(''),
  API_QUERY_METRICS: Joi.string().valid('true', 'false').optional().allow(''),
  API_SENTRY_PERFORMANCE_METRICS: Joi.string()
    .valid('true', 'false')
    .optional()
    .allow(''),
  API_SLOW_QUERY_SAMPLE_SIZE: Joi.string().optional().allow(''),
  API_SLOW_QUERY_THRESHOLD_MS: Joi.string().optional().allow(''),
  CONTENT_HARNESS_PACKAGES: Joi.string()
    .pattern(
      /^(@[a-z0-9][\w-]*\/)?[a-z0-9][\w.-]*(\s*,\s*(@[a-z0-9][\w-]*\/)?[a-z0-9][\w.-]*)*$/i,
    )
    .optional()
    .allow(''),
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
  // Marketplace (extracted service)
  MARKETPLACE_API_URL: Joi.string()
    .uri()
    .optional()
    .default('http://localhost:3200'),
  PGSSLROOTCERT: Joi.string().optional().allow(''),
  PRISMA_POSTGRES_CA_FILE: Joi.string().optional().allow(''),
  // Solana (optional)
  SOLANA_KEY: Joi.string().optional().allow(''),
  SOLANA_URL: Joi.string().optional().allow(''),
};

/**
 * Combined schema for API service
 */
const apiSchema = Joi.object({
  ...baseSchema,
  ...postgresSchema,
  ...redisSchema,
  ...awsSchema,
  ...betterAuthSchema,
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
  ...opusProSchema,
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

  /**
   * Public base URL of the API service (used to build webhook URLs).
   * Falls back to the production host when unset.
   */
  public get apiUrl(): string {
    return this.envConfig.GENFEEDAI_API_URL ?? 'https://api.genfeed.ai';
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
