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
  WEBSITE_REVALIDATE_SECRET: Joi.string()
    .optional()
    .allow('')
    .description(
      'Shared with the website; lets the API clear its page cache after a community unpublish.',
    ),
};
