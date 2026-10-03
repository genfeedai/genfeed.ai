import Joi from 'joi';

/**
 * Base schema - required by all services
 */
export const baseSchema = {
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  PORT: Joi.number().required(),
  TRUST_PROXY: Joi.string()
    .description(
      'Express trust-proxy value: true, false, a hop count, or proxy addresses/subnets (comma-separated). Unset: 1 on Cloud, false on self-host.',
    )
    .optional()
    .allow(''),
  TZ: Joi.string().default('America/Los_Angeles'),
  VERSION: Joi.string().default('v1'),
};
