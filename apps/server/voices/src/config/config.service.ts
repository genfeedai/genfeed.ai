import {
  createServiceConfig,
  type IEnvConfig,
  microservicesSchema,
  redisSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

interface VoicesEnvConfig extends IEnvConfig {
  DATASETS_PATH?: string;
  TTS_INFERENCE_URL?: string;
  VOICE_MODELS_PATH?: string;
  VOICE_TRAINING_BINARY_PATH?: string;
}

/**
 * Voices service config.
 *
 * Built on the shared `createServiceConfig` factory so the service gets the
 * same layered `.env` resolution and Joi validation as every other backend
 * service, instead of reading `process.env` directly.
 *
 * `microservicesSchema` supplies `GENFEEDAI_MICROSERVICES_FILES_URL`: optional
 * in cloud, defaulted to `http://localhost:3012` in self-hosted — exactly the
 * fallback `FILES_SERVICE_URL` already hard-coded.
 */
@Injectable()
export class ConfigService extends createServiceConfig<VoicesEnvConfig>({
  appName: 'voices',
  schemas: [redisSchema, microservicesSchema],
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
    DATASETS_PATH: Joi.string().optional().allow(''),
    GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
    // Compose default; `baseSchema` marks PORT required and nothing in the
    // voices deployment path is obliged to set it explicitly.
    PORT: Joi.number().default(3022),
    TTS_INFERENCE_URL: Joi.string().optional().allow(''),
    VOICE_MODELS_PATH: Joi.string().optional().allow(''),
    VOICE_TRAINING_BINARY_PATH: Joi.string().optional().allow(''),
  },
}) {
  get TTS_INFERENCE_URL(): string {
    return this.get('TTS_INFERENCE_URL') || 'http://localhost:8188';
  }

  get REDIS_URL(): string {
    return this.get('REDIS_URL') || 'redis://localhost:6379';
  }

  get API_KEY(): string {
    return this.get('GENFEEDAI_API_KEY') || '';
  }

  get FILES_SERVICE_URL(): string {
    return (
      this.get('GENFEEDAI_MICROSERVICES_FILES_URL') || 'http://localhost:3012'
    );
  }

  get VOICE_TRAINING_BINARY_PATH(): string {
    return (
      this.get('VOICE_TRAINING_BINARY_PATH') || '/usr/local/bin/voice-train'
    );
  }

  get VOICE_MODELS_PATH(): string {
    return this.get('VOICE_MODELS_PATH') || '/models/voices';
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
