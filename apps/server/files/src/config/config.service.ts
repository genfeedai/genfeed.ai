import {
  awsOptionalSchema,
  BaseConfigService,
  baseSchema,
  clerkMinimalSchema,
  ffmpegSchema,
  genfeedaiMinimalSchema,
  type IEnvConfig,
  redisSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

/**
 * Files service specific schema - only what this service needs
 */
const filesSchema = Joi.object({
  ...baseSchema,
  ...redisSchema,
  ...awsOptionalSchema,
  ...clerkMinimalSchema,
  ...ffmpegSchema,
  ...genfeedaiMinimalSchema,
  GENFEEDAI_API_KEY: Joi.string().optional(),
  // Files-specific
  GENFEEDAI_CDN_URL: Joi.string().uri().required(),
});

@Injectable()
export class ConfigService extends BaseConfigService<IEnvConfig> {
  constructor() {
    super(filesSchema, {
      appName: 'files',
      workingDir: 'apps/server',
    });
  }

  /**
   * Get the ingredients CDN endpoint
   */
  public get ingredientsEndpoint(): string {
    return `${this.envConfig.GENFEEDAI_CDN_URL}/ingredients`;
  }
}
