import Joi from 'joi';

/**
 * Genfeed internal URLs and services
 */
export const genfeedaiUrlsSchema = {
  GENFEEDAI_API_URL: Joi.string().uri().required(),
  GENFEEDAI_APP_URL: Joi.string().uri().required(),
  GENFEEDAI_CDN_URL: Joi.string().uri().required(),
  GENFEEDAI_WEBHOOKS_URL: Joi.string().uri().required(),
};

/**
 * Microservices URLs (optional - only needed by API gateway)
 */
export const microservicesSchema = {
  GENFEEDAI_MICROSERVICES_FILES_URL: Joi.string().uri().optional(),
  GENFEEDAI_MICROSERVICES_MCP_URL: Joi.string().uri().optional(),
  GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL: Joi.string().uri().optional(),
};

/**
 * Internal auth - service-to-service communication
 */
export const internalAuthSchema = {
  BULL_BOARD_AUTH_TOKEN: Joi.string()
    .optional()
    .description('Authentication token for Bull Board admin interface'),
  GENFEEDAI_API_KEY: Joi.string()
    .optional()
    .description('API key for internal service-to-service authentication'),
  TOKEN_ENCRYPTION_KEY: Joi.string()
    .min(32)
    .required()
    .description(
      'Encryption key for sensitive data. Must be at least 32 characters.',
    ),
};

/**
 * Minimal Genfeed config for microservices (just API URL)
 */
export const genfeedaiMinimalSchema = {
  GENFEEDAI_API_URL: Joi.string().uri().required(),
};
