import Joi from 'joi';

/**
 * Discord bot configuration (for notifications service)
 */
export const discordBotSchema = {
  DISCORD_BOT_TOKEN: Joi.string().optional().allow(''),
  DISCORD_CLIENT_ID: Joi.string().optional().allow(''),
};

/**
 * Telegram bot configuration (for notifications service)
 */
export const telegramBotSchema = {
  TELEGRAM_BOT_TOKEN: Joi.string().optional().allow(''),
  TELEGRAM_BOT_USERNAME: Joi.string().optional().allow(''),
};

/**
 * Resend email configuration (for notifications service)
 */
export const resendSchema = {
  RESEND_API_KEY: Joi.string().optional().allow(''),
};

/**
 * Twitch configuration (optional)
 */
export const twitchSchema = {
  TWITCH_CLIENT_ID: Joi.string().optional().allow(''),
};
