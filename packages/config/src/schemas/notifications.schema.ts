import Joi from 'joi';

/**
 * Discord bot configuration (for notifications service)
 */
export const discordBotSchema = {
  DISCORD_BOT_AVATAR_URL: Joi.string()
    .uri()
    .default('https://cdn.genfeed.ai/assets/branding/logo.jpg'),
  DISCORD_BOT_TOKEN: Joi.string().optional().allow(''),
  DISCORD_CHANNEL_ID_POSTS: Joi.string().optional().allow(''),
  DISCORD_CHANNEL_ID_STUDIO: Joi.string().optional().allow(''),
  DISCORD_CHANNEL_ID_USERS: Joi.string().optional().allow(''),
  DISCORD_CLIENT_ID: Joi.string().optional().allow(''),
  DISCORD_GUILD_ID: Joi.string().optional().allow(''),
};

/**
 * Telegram bot configuration (for notifications service)
 */
export const telegramBotSchema = {
  TELEGRAM_ADMIN_IDS: Joi.string().optional().allow(''),
  TELEGRAM_BOT_TOKEN: Joi.string().optional().allow(''),
  TELEGRAM_BOT_USERNAME: Joi.string().optional().allow(''),
};

/**
 * Resend email configuration (for notifications service)
 */
export const resendSchema = {
  RESEND_API_KEY: Joi.string().optional().allow(''),
  RESEND_FROM_EMAIL: Joi.string().email().optional().allow(''),
  RESEND_REPLY_TO_EMAIL: Joi.string().email().optional().allow(''),
};

/**
 * Twitch configuration (optional)
 */
export const twitchSchema = {
  TWITCH_CLIENT_ID: Joi.string().optional().allow(''),
};
