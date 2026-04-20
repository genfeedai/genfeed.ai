import {
  BaseConfigService,
  baseSchema,
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

const workersSpecificSchema = {
  GF_DEV_ENABLE_SCHEDULERS: Joi.string()
    .valid('true', 'false')
    .optional()
    .allow(''),
};

const workersSchema = Joi.object({
  ...baseSchema,
  ...postgresSchema,
  ...redisSchema,
  ...sentryOptionalSchema,
  ...workersSpecificSchema,
});

@Injectable()
export class ConfigService extends BaseConfigService<WorkersEnvConfig> {
  constructor() {
    super(workersSchema, {
      appName: 'workers',
      workingDir: 'apps/server',
    });
  }

  public get isDevSchedulersEnabled(): boolean {
    return this.isLocalDevFlagEnabled('GF_DEV_ENABLE_SCHEDULERS');
  }

  private isLocalDevFlagEnabled(key: 'GF_DEV_ENABLE_SCHEDULERS'): boolean {
    if (!this.isDevelopment) {
      return true;
    }

    return String(this.get(key) ?? '').toLowerCase() === 'true';
  }
}
