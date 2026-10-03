import {
  awsOptionalSchema,
  createServiceConfig,
  ffmpegSchema,
  genfeedaiMinimalSchema,
  type IEnvConfig,
  isCloudDeployment,
  redisSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

interface FilesEnvConfig extends IEnvConfig {
  GENFEED_STORAGE_PATH?: string;
  GENFEEDAI_MEDIA_ISSUER_ENABLED: 'true' | 'false';
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
    GENFEEDAI_MEDIA_ISSUER_ENABLED: Joi.string()
      .valid('true', 'false')
      .default('false'),
    // Files-specific
    GENFEEDAI_CDN_URL: Joi.string().uri().required(),
    GENFEED_STORAGE_PATH: Joi.string().optional().allow(''),
  },
}) {
  public get isAuthorizedMediaDeliveryEnabled(): boolean {
    return (
      isCloudDeployment() &&
      this.envConfig.GENFEEDAI_MEDIA_ISSUER_ENABLED === 'true'
    );
  }

  /**
   * Get the ingredients CDN endpoint
   */
  public get ingredientsEndpoint(): string {
    return `${this.envConfig.GENFEEDAI_CDN_URL}/ingredients`;
  }
}
