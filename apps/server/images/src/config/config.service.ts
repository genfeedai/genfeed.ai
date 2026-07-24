import {
  createServiceConfig,
  type IEnvConfig,
  redisSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

interface ImagesEnvConfig extends IEnvConfig {
  COMFYUI_LORAS_PATH?: string;
  COMFYUI_OUTPUT_PATH?: string;
  COMFYUI_URL?: string;
  DATASETS_PATH?: string;
  TRAINING_BINARY_PATH?: string;
}

/**
 * Images service config.
 *
 * Built on the shared `createServiceConfig` factory so the service gets the
 * same layered `.env` resolution and Joi validation as every other backend
 * service, instead of reading `process.env` directly.
 */
@Injectable()
export class ConfigService extends createServiceConfig<ImagesEnvConfig>({
  appName: 'images',
  schemas: [redisSchema],
  extend: {
    // AWS keys are declared inline rather than pulled from `awsOptionalSchema`:
    // that fragment defaults AWS_REGION to 'us-west-1' and AWS_S3_BUCKET to
    // 'cdn.genfeed.ai', which would pre-fill both values and stop the getters'
    // own 'us-east-1' / '' fallbacks from ever firing. Same reasoning as
    // apps/server/workers.
    AWS_ACCESS_KEY_ID: Joi.string().optional().allow(''),
    AWS_REGION: Joi.string().optional().allow(''),
    AWS_S3_BUCKET: Joi.string().optional().allow(''),
    AWS_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
    COMFYUI_LORAS_PATH: Joi.string().optional().allow(''),
    COMFYUI_OUTPUT_PATH: Joi.string().optional().allow(''),
    COMFYUI_URL: Joi.string().optional().allow(''),
    DATASETS_PATH: Joi.string().optional().allow(''),
    GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
    // Compose default; `baseSchema` marks PORT required and nothing in the
    // images deployment path is obliged to set it explicitly.
    PORT: Joi.number().default(3020),
    TRAINING_BINARY_PATH: Joi.string().optional().allow(''),
  },
}) {
  get COMFYUI_URL(): string {
    return this.get('COMFYUI_URL') || 'http://localhost:8188';
  }

  get COMFYUI_OUTPUT_PATH(): string {
    return this.get('COMFYUI_OUTPUT_PATH') || '/opt/ComfyUI/output';
  }

  get REDIS_URL(): string {
    return this.get('REDIS_URL') || 'redis://localhost:6379';
  }

  get API_KEY(): string {
    return this.get('GENFEEDAI_API_KEY') || '';
  }

  get TRAINING_BINARY_PATH(): string {
    return this.get('TRAINING_BINARY_PATH') || '/usr/local/bin/accelerate';
  }

  get COMFYUI_LORAS_PATH(): string {
    return this.get('COMFYUI_LORAS_PATH') || '/comfyui/models/loras';
  }

  get AWS_S3_BUCKET(): string {
    return this.get('AWS_S3_BUCKET') || '';
  }

  get AWS_ACCESS_KEY_ID(): string {
    return this.get('AWS_ACCESS_KEY_ID') || '';
  }

  get AWS_SECRET_ACCESS_KEY(): string {
    return this.get('AWS_SECRET_ACCESS_KEY') || '';
  }

  get AWS_REGION(): string {
    return this.get('AWS_REGION') || 'us-east-1';
  }

  get DATASETS_PATH(): string {
    return this.get('DATASETS_PATH') || '/datasets';
  }
}
