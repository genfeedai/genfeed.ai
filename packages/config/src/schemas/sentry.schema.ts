import Joi from 'joi';

/**
 * Sentry error tracking - required
 */
export const sentrySchema = {
  SENTRY_AUTH_TOKEN_API: Joi.string().optional().allow(''),
  SENTRY_DSN: Joi.string().uri().required(),
  SENTRY_ENVIRONMENT: Joi.string().required(),
};

/**
 * Sentry error tracking - optional (for microservices)
 */
export const sentryOptionalSchema = {
  SENTRY_DSN: Joi.string().uri().optional().allow(''),
  SENTRY_ENVIRONMENT: Joi.string().optional().allow(''),
};
