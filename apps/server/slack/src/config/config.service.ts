import { createServiceConfig, type IEnvConfig } from '@genfeedai/config';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';

/**
 * Slack service config.
 *
 * Built on the shared `createServiceConfig` factory so the service gets the
 * same layered `.env` resolution and Joi validation as every other backend
 * service, instead of reading `process.env` directly.
 *
 * `PORT` carries the service's compose default (3018) because nothing in the
 * Slack deployment path is required to set it explicitly, and `baseSchema`
 * marks it `required()`.
 */
@Injectable()
export class ConfigService extends createServiceConfig<IEnvConfig>({
  appName: 'slack',
  extend: {
    // Deliberately not `.uri()`-constrained: these were previously unvalidated,
    // and the getters below already supply working fallbacks. Tightening them
    // here would turn a soft misconfiguration into a boot failure.
    GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
    GENFEEDAI_API_URL: Joi.string().optional().allow(''),
    PORT: Joi.number().default(3018),
  },
}) {
  get API_URL(): string {
    return this.get('GENFEEDAI_API_URL') || 'http://localhost:3010';
  }

  get API_KEY(): string {
    return this.get('GENFEEDAI_API_KEY') || '';
  }
}
