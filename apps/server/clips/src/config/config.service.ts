import {
  createServiceConfig,
  genfeedaiMinimalSchema,
  type IEnvConfig,
  microservicesSchema,
} from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

@Injectable()
export class ConfigService extends createServiceConfig<IEnvConfig>({
  appName: 'clips',
  schemas: [genfeedaiMinimalSchema, microservicesSchema],
  extend: {
    GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
    OPENROUTER_API_KEY: Joi.string().optional().allow(''),
  },
}) {
  get API_URL(): string {
    // Self-hosted fallback: GENFEEDAI_API_URL is optional when GENFEED_CLOUD is unset.
    // In cloud mode the constructor schema validates it as required and throws before this runs.
    return this.get('GENFEEDAI_API_URL') || 'http://localhost:3010';
  }

  get FILES_URL(): string {
    return (
      this.get('GENFEEDAI_MICROSERVICES_FILES_URL') || 'http://localhost:3012'
    );
  }

  get API_KEY(): string {
    return this.get('GENFEEDAI_API_KEY') || '';
  }

  get OPENROUTER_API_KEY(): string {
    return this.get('OPENROUTER_API_KEY') || '';
  }
}
