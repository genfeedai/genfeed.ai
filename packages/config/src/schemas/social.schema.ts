import Joi from 'joi';

/**
 * YouTube OAuth (required - core integration)
 */
export const youtubeSchema = {
  YOUTUBE_API_KEY: Joi.string().optional().allow(''),
  YOUTUBE_CLIENT_ID: Joi.string().required(),
  YOUTUBE_CLIENT_SECRET: Joi.string().required(),
  YOUTUBE_REDIRECT_URI: Joi.string().uri().required(),
};

/**
 * TikTok OAuth (required - core integration)
 */
export const tiktokSchema = {
  TIKTOK_CLIENT_KEY: Joi.string().required(),
  TIKTOK_CLIENT_SECRET: Joi.string().required(),
};

/**
 * Instagram Graph API (required - core integration)
 */
export const instagramSchema = {
  INSTAGRAM_API_VERSION: Joi.string().required(),
  INSTAGRAM_APP_ID: Joi.string().required(),
  INSTAGRAM_APP_SECRET: Joi.string().required(),
  INSTAGRAM_GRAPH_URL: Joi.string().uri().required(),
  INSTAGRAM_REDIRECT_URI: Joi.string().uri().required(),
};

/**
 * Facebook Graph API (required - core integration)
 */
export const facebookSchema = {
  FACEBOOK_API_VERSION: Joi.string().required(),
  FACEBOOK_APP_ID: Joi.string().required(),
  FACEBOOK_APP_SECRET: Joi.string().required(),
  FACEBOOK_GRAPH_URL: Joi.string().uri().required(),
  FACEBOOK_REDIRECT_URI: Joi.string().uri().required(),
};

/**
 * Twitter/X API (required - core integration)
 */
export const twitterSchema = {
  TWITTER_BEARER_TOKEN: Joi.string().required(),
  TWITTER_CLIENT_ID: Joi.string().required(),
  TWITTER_CLIENT_SECRET: Joi.string().required(),
  TWITTER_CONSUMER_KEY: Joi.string().required(),
  TWITTER_CONSUMER_SECRET: Joi.string().required(),
  TWITTER_REDIRECT_URI: Joi.string().uri().required(),
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
 * Mastodon API (optional integration — instance-specific)
 */
export const mastodonSchema = {
  MASTODON_DEFAULT_INSTANCE_URL: Joi.string().uri().optional().allow(''),
};

/**
 * Ghost Admin API (optional integration — self-hosted)
 */
export const ghostSchema = {
  GHOST_DEFAULT_API_URL: Joi.string().uri().optional().allow(''),
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
 * All social platforms combined (for API service)
 */
export const allSocialSchema = {
  ...youtubeSchema,
  ...tiktokSchema,
  ...instagramSchema,
  ...facebookSchema,
  ...twitterSchema,
  ...pinterestSchema,
  ...redditSchema,
  ...linkedinSchema,
  ...mediumSchema,
  ...fanvueSchema,
  ...slackSchema,
  ...wordpressSchema,
  ...snapchatSchema,
  ...whatsappSchema,
  ...mastodonSchema,
  ...ghostSchema,
  ...shopifySchema,
  ...beehiivSchema,
};
