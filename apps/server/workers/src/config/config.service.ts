import {
  createServiceConfig,
  genfeedaiUrlsSchema,
  type IEnvConfig,
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
    genfeedaiUrlsSchema,
  ],
  extend: {
    GF_DEV_ENABLE_SCHEDULERS: Joi.string()
      .valid('true', 'false')
      .optional()
      .allow(''),
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
