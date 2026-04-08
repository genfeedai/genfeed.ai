import Joi from 'joi';

import { conditionalRequired } from '../helpers';

/**
 * Sentry error tracking - required in cloud, optional in self-hosted
 */
export const sentrySchema = {
  SENTRY_AUTH_TOKEN_API: Joi.string().optional().allow(''),
  SENTRY_DSN: conditionalRequired(Joi.string().uri()),
  SENTRY_ENABLED: Joi.string().valid('true', 'false').optional().allow(''),
  SENTRY_ENVIRONMENT: conditionalRequired(),
};

/**
 * Sentry error tracking - optional (for microservices)
 */
export const sentryOptionalSchema = {
  SENTRY_DSN: Joi.string().uri().optional().allow(''),
  SENTRY_ENABLED: Joi.string().valid('true', 'false').optional().allow(''),
  SENTRY_ENVIRONMENT: Joi.string().optional().allow(''),
};
