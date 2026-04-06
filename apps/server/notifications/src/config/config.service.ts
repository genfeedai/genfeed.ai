import {
  BaseConfigService,
  baseSchema,
  clerkMinimalSchema,
  discordBotSchema,
  genfeedaiMinimalSchema,
  type IEnvConfig,
  redisSchema,
  resendSchema,
  sentryOptionalSchema,
  telegramBotSchema,
  twitchSchema,
} from '@genfeedai/config';
import { Injectable, Logger } from '@nestjs/common';
import Joi from 'joi';

/**
 * Notifications service specific schema
 */
const notificationsSchema = Joi.object({
  ...baseSchema,
  ...redisSchema,
  ...clerkMinimalSchema,
  ...sentryOptionalSchema,
  ...genfeedaiMinimalSchema,
  ...discordBotSchema,
  ...telegramBotSchema,
  ...resendSchema,
  ...twitchSchema,
  API_BASE_URL: Joi.string().uri().default('http://localhost:3001'),
  API_SECRET_KEY: Joi.string().optional().allow(''),
  GENFEEDAI_API_KEY: Joi.string().optional().allow(''),
  // Notifications-specific
  GENFEEDAI_APP_URL: Joi.string().uri().optional().allow(''),
});

@Injectable()
export class ConfigService extends BaseConfigService<IEnvConfig> {
  private readonly logger = new Logger(ConfigService.name);

  constructor() {
    super(notificationsSchema, {
      appName: 'notifications',
      workingDir: 'apps/server',
    });

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
