import Joi from 'joi';

/**
 * Webhook secrets for external services
 */
export const webhooksSchema = {
  SYSTEM_EVENTS_WEBHOOK_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .optional()
    .allow(''),
  SYSTEM_EVENTS_WEBHOOK_SECRET: Joi.string().min(32).optional().allow(''),
  SYSTEM_EVENTS_ENABLED_AT: Joi.string().isoDate().optional().allow(''),
  CHROME_EXTENSION_ID: Joi.string()
    .length(32)
    .optional()
    .description(
      'Chrome Extension ID for CORS. Get this after publishing to Chrome Web Store.',
    ),
  VERCEL_WEBHOOK_SECRET: Joi.string().optional().allow(''),
};
