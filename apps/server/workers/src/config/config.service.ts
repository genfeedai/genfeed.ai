import {
  createServiceConfig,
  type IEnvConfig,
  microservicesSchema,
  postgresSchema,
  redisSchema,
  sentryOptionalSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

interface WorkersEnvConfig extends IEnvConfig {
  GF_DEV_ENABLE_SCHEDULERS?: 'true' | 'false';
}

@Injectable()
export class ConfigService extends createServiceConfig<WorkersEnvConfig>({
  appName: 'workers',
  schemas: [
    postgresSchema,
    redisSchema,
    sentryOptionalSchema,
    // #484: workers reaches the files service (clip processors) and the
    // microservices URLs default to localhost in self-hosted instead of
    // silently resolving to undefined.
    microservicesSchema,
  ],
  extend: {
    GF_DEV_ENABLE_SCHEDULERS: Joi.string()
      .valid('true', 'false')
      .optional()
      .allow(''),
    // #484: workers consumes these genfeed URLs at runtime — GENFEEDAI_CDN_URL
    // via ingredientsEndpoint, GENFEEDAI_WEBHOOKS_URL via the workspace-task
    // processor, GENFEEDAI_APP_URL via the trend-summary cron — but validated
    // none of them. Optional-but-well-formed: absence is tolerated (self-hosted
    // poll fallbacks), a malformed value fails fast at boot instead of producing
    // a broken URL in production.
    GENFEEDAI_APP_URL: Joi.string().uri().optional().allow(''),
    GENFEEDAI_CDN_URL: Joi.string().uri().optional().allow(''),
    GENFEEDAI_WEBHOOKS_URL: Joi.string().uri().optional().allow(''),
  },
}) {
  public get isDevSchedulersEnabled(): boolean {
    return this.isLocalDevFlagEnabled('GF_DEV_ENABLE_SCHEDULERS');
  }

  public get ingredientsEndpoint(): string {
    return `${this.envConfig.GENFEEDAI_CDN_URL}/ingredients`;
  }

  private isLocalDevFlagEnabled(key: 'GF_DEV_ENABLE_SCHEDULERS'): boolean {
    if (!this.isDevelopment) {
      return true;
    }

    return String(this.get(key) ?? '').toLowerCase() === 'true';
  }
}
