import Joi from 'joi';

/**
 * Base schema - required by all services
 */
export const baseSchema = {
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  PORT: Joi.number().required(),
  TZ: Joi.string().default('America/Los_Angeles'),
  VERSION: Joi.string().default('v1'),
};
