import {
  awsOptionalSchema,
  createServiceConfig,
  ffmpegSchema,
  genfeedaiMinimalSchema,
  type IEnvConfig,
  redisSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

interface FilesEnvConfig extends IEnvConfig {
  GENFEED_STORAGE_PATH?: string;
}

@Injectable()
export class ConfigService extends createServiceConfig<FilesEnvConfig>({
  appName: 'files',
  schemas: [
    redisSchema,
    awsOptionalSchema,
    ffmpegSchema,
    genfeedaiMinimalSchema,
  ],
  extend: {
    GENFEEDAI_API_KEY: Joi.string().optional(),
    // Files-specific
    GENFEEDAI_CDN_URL: Joi.string().uri().required(),
    GENFEED_STORAGE_PATH: Joi.string().optional().allow(''),
  },
}) {
  /**
   * Get the ingredients CDN endpoint
   */
  public get ingredientsEndpoint(): string {
    return `${this.envConfig.GENFEEDAI_CDN_URL}/ingredients`;
  }
}
