import Joi from 'joi';

import { conditionalRequired, UNCONFIGURED_SECRET_SENTINEL } from '../helpers';

/**
 * YouTube OAuth (required in cloud, optional in self-hosted)
 */
export const youtubeSchema = {
  YOUTUBE_API_KEY: Joi.string().optional().allow(''),
  YOUTUBE_REDIRECT_URI: conditionalRequired(Joi.string().uri()),
};

/**
 * TikTok OAuth (required in cloud, optional in self-hosted)
 */
export const tiktokSchema = {
  TIKTOK_CLIENT_KEY: conditionalRequired(),
  TIKTOK_CLIENT_SECRET: conditionalRequired(),
};

/**
 * Instagram Graph API (required in cloud, optional in self-hosted)
 */
export const instagramSchema = {
  INSTAGRAM_API_VERSION: conditionalRequired(),
  INSTAGRAM_APP_ID: conditionalRequired(),
  INSTAGRAM_APP_SECRET: conditionalRequired(),
  INSTAGRAM_GRAPH_URL: conditionalRequired(Joi.string().uri()),
  INSTAGRAM_REDIRECT_URI: conditionalRequired(Joi.string().uri()),
};

/**
 * Facebook Graph API (required in cloud, optional in self-hosted)
 */
export const facebookSchema = {
  FACEBOOK_API_VERSION: conditionalRequired(),
  FACEBOOK_APP_ID: conditionalRequired(),
  FACEBOOK_APP_SECRET: conditionalRequired(),
  FACEBOOK_GRAPH_URL: conditionalRequired(Joi.string().uri()),
  FACEBOOK_REDIRECT_URI: conditionalRequired(Joi.string().uri()),
};

/**
 * Google Ads connector-specific configuration. The provider-level OAuth client
 * is validated separately by googleOAuthSchema.
 */
export const googleAdsSchema = {
  GOOGLE_ADS_REDIRECT_URI: Joi.string().uri().optional().allow(''),
  GOOGLE_ADS_DEVELOPER_TOKEN: Joi.string().optional().allow(''),
};

/**
 * Google Search Console connector-specific configuration. The provider-level
 * OAuth client is validated separately by googleOAuthSchema.
 */
export const googleSearchConsoleSchema = {
  GOOGLE_SEARCH_CONSOLE_REDIRECT_URI: Joi.string().uri().optional().allow(''),
};

/**
 * Twitter/X API (required in cloud, optional in self-hosted)
 */
export const twitterSchema = {
  TWITTER_BEARER_TOKEN: conditionalRequired(),
  TWITTER_CLIENT_ID: conditionalRequired(),
  TWITTER_CLIENT_SECRET: conditionalRequired(),
  TWITTER_CONSUMER_KEY: conditionalRequired(),
  TWITTER_CONSUMER_SECRET: conditionalRequired(),
  TWITTER_REDIRECT_URI: conditionalRequired(Joi.string().uri()),
};

/**
 * X (Twitter) Ads API (optional everywhere — the integration is not provisioned
 * in cloud production; XAdsOAuthService degrades gracefully when credentials
 * are absent, mirroring googleAdsSchema).
 */
export const xAdsSchema = {
  X_ADS_API_KEY: Joi.string().optional().allow(''),
  X_ADS_API_SECRET: Joi.string().optional().allow(''),
  X_ADS_REDIRECT_URI: Joi.string().uri().optional().allow(''),
  // Explicit operator attestations remain independent from authentication.
  X_ADS_REPOSITORY_COMMERCIAL_USE_APPROVED: Joi.string()
    .valid('true', 'false')
    .optional(),
  X_ADS_REPOSITORY_ENTITLEMENT_CONFIRMED: Joi.string()
    .valid('true', 'false')
    .optional(),
};

/**
 * Pinterest API (optional integration)
 */
export const pinterestSchema = {
  PINTEREST_CLIENT_ID: Joi.string().optional().allow(''),
  PINTEREST_CLIENT_SECRET: Joi.string().optional().allow(''),
  PINTEREST_REDIRECT_URI: Joi.string().uri().optional().allow(''),
};

/**
 * Reddit API (optional integration)
 */
export const redditSchema = {
  REDDIT_CLIENT_ID: Joi.string().optional().allow(''),
  REDDIT_CLIENT_SECRET: Joi.string().optional().allow(''),
  REDDIT_REDIRECT_URI: Joi.string().uri().optional().allow(''),
  REDDIT_USER_AGENT: Joi.string().optional().allow(''),
};

/**
 * LinkedIn API (optional integration)
 */
export const linkedinSchema = {
  LINKEDIN_CLIENT_ID: Joi.string().optional().allow(''),
  LINKEDIN_CLIENT_SECRET: Joi.string().optional().allow(''),
  LINKEDIN_REDIRECT_URI: Joi.string().uri().optional().allow(''),
  LINKEDIN_TREND_SOURCE_URLS: Joi.string().optional().allow(''),
};

/**
 * Medium API (optional integration)
 */
export const mediumSchema = {
  MEDIUM_CLIENT_ID: Joi.string().optional().allow(''),
  MEDIUM_CLIENT_SECRET: Joi.string().optional().allow(''),
  MEDIUM_REDIRECT_URI: Joi.string().uri().optional().allow(''),
};

/**
 * Fanvue API (optional integration)
 */
export const fanvueSchema = {
  FANVUE_CLIENT_ID: Joi.string().optional().allow(''),
  FANVUE_CLIENT_SECRET: Joi.string().optional().allow(''),
  FANVUE_REDIRECT_URI: Joi.string().uri().optional().allow(''),
};

/**
 * Threads API (optional everywhere until a provider app is provisioned).
 * Runtime OAuth guards fail closed when the three OAuth values are incomplete.
 */
export const threadsSchema = {
  THREADS_API_VERSION: Joi.string().optional().allow(''),
  THREADS_CLIENT_ID: Joi.string().optional().allow(''),
  THREADS_CLIENT_SECRET: Joi.string().optional().allow(''),
  THREADS_GRAPH_URL: Joi.string()
    .uri()
    .optional()
    .allow('', UNCONFIGURED_SECRET_SENTINEL),
  THREADS_REDIRECT_URI: Joi.string()
    .uri()
    .optional()
    .allow('', UNCONFIGURED_SECRET_SENTINEL),
};

/**
 * Slack API (optional integration)
 */
export const slackSchema = {
  SLACK_CLIENT_ID: Joi.string().optional().allow(''),
  SLACK_CLIENT_SECRET: Joi.string().optional().allow(''),
  SLACK_REDIRECT_URI: Joi.string().uri().optional().allow(''),
  SLACK_SIGNING_SECRET: Joi.string().optional().allow(''),
};

/**
 * WordPress.com API (optional integration)
 */
export const wordpressSchema = {
  WORDPRESS_CLIENT_ID: Joi.string().optional().allow(''),
  WORDPRESS_CLIENT_SECRET: Joi.string().optional().allow(''),
  WORDPRESS_REDIRECT_URI: Joi.string().uri().optional().allow(''),
};

/**
 * Snapchat API (optional integration)
 */
export const snapchatSchema = {
  SNAPCHAT_CLIENT_ID: Joi.string().optional().allow(''),
  SNAPCHAT_CLIENT_SECRET: Joi.string().optional().allow(''),
  SNAPCHAT_REDIRECT_URI: Joi.string().uri().optional().allow(''),
};

/**
 * WhatsApp Business API via Twilio (optional integration)
 */
export const whatsappSchema = {
  WHATSAPP_TWILIO_ACCOUNT_SID: Joi.string().optional().allow(''),
  WHATSAPP_TWILIO_AUTH_TOKEN: Joi.string().optional().allow(''),
  WHATSAPP_TWILIO_PHONE_NUMBER: Joi.string().optional().allow(''),
};

/**
 * Shopify API (optional integration — GraphQL)
 */
export const shopifySchema = {
  SHOPIFY_CLIENT_ID: Joi.string().optional().allow(''),
  SHOPIFY_CLIENT_SECRET: Joi.string().optional().allow(''),
  SHOPIFY_REDIRECT_URI: Joi.string().uri().optional().allow(''),
};

/**
 * Beehiiv API (optional integration — newsletters)
 */
export const beehiivSchema = {
  BEEHIIV_API_URL: Joi.string().uri().optional().allow(''),
};

/**
 * dev.to / Forem API (optional integration — API-key based, no OAuth).
 * The API key is supplied per-brand at connect time; only the base URL is
 * configurable (defaults to https://dev.to/api).
 */
export const devtoSchema = {
  DEVTO_API_URL: Joi.string().uri().optional().allow(''),
};

/**
 * Unipile communication provider (optional integration)
 */
export const unipileSchema = {
  UNIPILE_API_BASE_URL: Joi.string().uri().optional().allow(''),
  UNIPILE_API_KEY: Joi.string().optional().allow(''),
  UNIPILE_WEBHOOK_SECRET: Joi.string().optional().allow(''),
};

/**
 * All social platforms combined (for API service)
 */
export const allSocialSchema = {
  ...youtubeSchema,
  ...tiktokSchema,
  ...instagramSchema,
  ...facebookSchema,
  ...googleAdsSchema,
  ...googleSearchConsoleSchema,
  ...twitterSchema,
  ...xAdsSchema,
  ...pinterestSchema,
  ...redditSchema,
  ...linkedinSchema,
  ...mediumSchema,
  ...fanvueSchema,
  ...threadsSchema,
  ...slackSchema,
  ...wordpressSchema,
  ...snapchatSchema,
  ...whatsappSchema,
  ...shopifySchema,
  ...beehiivSchema,
  ...devtoSchema,
  ...unipileSchema,
};
