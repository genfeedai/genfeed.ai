import Joi from 'joi';

/**
 * Webhook secrets for external services
 */
export const webhooksSchema = {
  SYSTEM_NOTIFICATIONS_DISCORD_WEBHOOK_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .optional()
    .allow(''),
  CHROME_EXTENSION_ID: Joi.string()
    .length(32)
    .optional()
    .description(
      'Chrome Extension ID for CORS. Get this after publishing to Chrome Web Store.',
    ),
  VERCEL_WEBHOOK_SECRET: Joi.string().optional().allow(''),
};
