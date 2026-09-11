import Joi from 'joi';

/**
 * Webhook secrets for external services
 */
export const webhooksSchema = {
  CHROME_EXTENSION_ID: Joi.string()
    .length(32)
    .optional()
    .description(
      'Chrome Extension ID for CORS. Get this after publishing to Chrome Web Store.',
    ),
  VERCEL_WEBHOOK_SECRET: Joi.string().optional().allow(''),
};
