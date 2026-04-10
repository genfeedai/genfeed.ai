import Joi from 'joi';

import { conditionalRequired, IS_SELF_HOSTED } from '../helpers';

/**
 * Genfeed internal URLs and services
 */
export const genfeedaiUrlsSchema = {
  GENFEEDAI_API_URL: conditionalRequired(Joi.string().uri()),
  GENFEEDAI_APP_URL: conditionalRequired(Joi.string().uri()),
  GENFEEDAI_CDN_URL: conditionalRequired(Joi.string().uri()),
  GENFEEDAI_WEBHOOKS_URL: conditionalRequired(Joi.string().uri()),
};

/**
 * Microservices URLs (optional in cloud, localhost defaults in self-hosted)
 */
export const microservicesSchema = {
  GENFEEDAI_MICROSERVICES_FILES_URL: IS_SELF_HOSTED
    ? Joi.string().default('http://localhost:3012')
    : Joi.string().uri().optional(),
  GENFEEDAI_MICROSERVICES_MCP_URL: IS_SELF_HOSTED
    ? Joi.string().default('http://localhost:3014')
    : Joi.string().uri().optional(),
  GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL: IS_SELF_HOSTED
    ? Joi.string().default('http://localhost:3011')
    : Joi.string().uri().optional(),
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
  GITHUB_WEBHOOK_SECRET: Joi.string()
    .optional()
    .description(
      'HMAC secret for GitHub Secret Scanning Partner Program webhooks',
    ),
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
  GENFEEDAI_API_URL: conditionalRequired(Joi.string().uri()),
};
