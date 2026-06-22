import {
  createServiceConfig,
  falSchema,
  huggingFaceSchema,
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
    // #484: workers' model-discovery reads these AI-provider keys
    // (fal-discovery.service, hugging-face-discovery.service). Both are optional
    // fragments — absence is tolerated at runtime, presence is schema-documented.
    falSchema,
    huggingFaceSchema,
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
    // #484: more vars workers consumes via configService.get() but never
    // validated. Kept optional (no required/conditionalRequired) so a service
    // that runs without them does not crash at boot, and AWS_REGION carries no
    // default so the llm-idle cron's own `|| 'us-east-1'` fallback is preserved.
    // - OPENROUTER_API_KEY: clip-factory/clip-analyze processors
    // - REPLICATE_KEY: model-watcher cron + model-discovery service (soft-fails)
    // - AWS_*: llm-idle cron's EC2Client credentials/region
    // - GPU_LLM_INSTANCE_ID: llm-idle cron (gpuFleetSchema is not exported from
    //   @genfeedai/config, so the single consumed key is inlined here)
    // - SERVICE_NAME: health-response label (main.ts)
    AWS_ACCESS_KEY_ID: Joi.string().optional().allow(''),
    AWS_REGION: Joi.string().optional(),
    AWS_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
    GPU_LLM_INSTANCE_ID: Joi.string().optional().allow(''),
    OPENROUTER_API_KEY: Joi.string().optional().allow(''),
    REPLICATE_KEY: Joi.string().optional().allow(''),
    SERVICE_NAME: Joi.string().optional().allow(''),
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
