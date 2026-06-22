import {
  clerkMinimalSchema,
  createServiceConfig,
  discordBotSchema,
  genfeedaiMinimalSchema,
  type IEnvConfig,
  redisSchema,
  resendSchema,
  sentryOptionalSchema,
  telegramBotSchema,
  twitchSchema,
  webhooksSchema,
} from '@genfeedai/config';
import { Injectable, Logger } from '@nestjs/common';
import Joi from 'joi';

@Injectable()
export class ConfigService extends createServiceConfig<IEnvConfig>({
  appName: 'notifications',
  schemas: [
    redisSchema,
    clerkMinimalSchema,
    sentryOptionalSchema,
    genfeedaiMinimalSchema,
    discordBotSchema,
    telegramBotSchema,
    resendSchema,
    twitchSchema,
    // #484: main.ts reads CHROME_EXTENSION_ID for CORS; webhooksSchema is the
    // canonical home (length-32 constraint fails fast on a malformed value).
    webhooksSchema,
  ],
  extend: {
    API_BASE_URL: Joi.string().uri().default('http://localhost:3010'),
    API_SECRET_KEY: Joi.string().optional().allow(''),
    GENFEED_LOCAL_TERMINAL: Joi.string()
      .valid('true', 'false')
      .optional()
      .allow(''),
    GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
    // Notifications-specific
    GENFEEDAI_APP_URL: Joi.string().uri().optional().allow(''),
    GENFEED_TERMINAL_CWD: Joi.string().optional().allow(''),
    // #484: more vars notifications consumes but never validated. Optional so a
    // deployment without them still boots; GENFEED_CLOUD/NEXT_PUBLIC_GENFEED_CLOUD
    // are kept format-free (not .valid('true','false')) so an existing cloud env
    // with an unconventional value is not rejected at boot.
    // - SLACK_NOTIFICATION_BOT_TOKEN: slack.service
    // - GENFEED_CLOUD / NEXT_PUBLIC_GENFEED_CLOUD: terminal.service cloud gate
    // - VALIDATION_*: validation.config file-upload limits
    GENFEED_CLOUD: Joi.string().optional().allow(''),
    NEXT_PUBLIC_GENFEED_CLOUD: Joi.string().optional().allow(''),
    SLACK_NOTIFICATION_BOT_TOKEN: Joi.string().optional().allow(''),
    VALIDATION_AUDIO_FORMATS: Joi.string().optional().allow(''),
    VALIDATION_IMAGE_FORMATS: Joi.string().optional().allow(''),
    VALIDATION_MAX_FILE_SIZE: Joi.string().optional().allow(''),
    VALIDATION_VIDEO_FORMATS: Joi.string().optional().allow(''),
  },
}) {
  private readonly logger = new Logger(ConfigService.name);

  constructor() {
    super();

    this.logConfiguration();
  }

  private logConfiguration(): void {
    // Warn about missing optional configurations in production
    if (this.isProduction) {
      const warnings: string[] = [];

      if (!this.envConfig.SENTRY_DSN) {
        warnings.push('SENTRY_DSN is not configured - error tracking disabled');
      }

      if (!this.envConfig.TELEGRAM_BOT_TOKEN) {
        warnings.push('Telegram bot is not configured');
      }

      if (!this.envConfig.DISCORD_BOT_TOKEN) {
        warnings.push('Discord bot is not configured');
      }

      if (!this.envConfig.RESEND_API_KEY) {
        warnings.push(
          'Resend is not configured - email notifications disabled',
        );
      }

      if (warnings.length > 0) {
        this.logger.warn('Configuration warnings for production:');
        for (const warning of warnings) {
          this.logger.warn(`  - ${warning}`);
        }
      }
    }

    // Log successful configuration
    this.logger.log('Configuration validated successfully');
    this.logger.log(`   Environment: ${this.envConfig.NODE_ENV}`);
    this.logger.log(`   Port: ${this.envConfig.PORT}`);
    this.logger.log(
      `   Redis: ${this.envConfig.REDIS_URL ? 'Connected' : 'Not configured'}`,
    );

    const services = [
      this.envConfig.TELEGRAM_BOT_TOKEN && 'Telegram',
      this.envConfig.DISCORD_BOT_TOKEN && 'Discord',
      this.envConfig.RESEND_API_KEY && 'Resend',
    ].filter(Boolean);

    if (services.length > 0) {
      this.logger.log(`   Services: ${services.join(', ')}`);
    }
  }

  // Helper methods for specific services
  public isTelegramEnabled(): boolean {
    return !!this.envConfig.TELEGRAM_BOT_TOKEN;
  }

  public isDiscordEnabled(): boolean {
    return !!(
      this.envConfig.DISCORD_BOT_TOKEN &&
      this.envConfig.DISCORD_CLIENT_ID &&
      this.envConfig.DISCORD_GUILD_ID
    );
  }

  public isResendEnabled(): boolean {
    return !!this.envConfig.RESEND_API_KEY;
  }

  public isSentryEnabled(): boolean {
    return !!this.envConfig.SENTRY_DSN;
  }
}
