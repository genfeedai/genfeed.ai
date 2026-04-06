import { ConfigService } from '@api/config/config.service';
import { DiscordBotAdapter } from '@api/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@api/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@api/services/bot-gateway/adapters/telegram-bot.adapter';
import { BotGenerationService } from '@api/services/bot-gateway/services/bot-generation.service';
import { BotUserResolverService } from '@api/services/bot-gateway/services/bot-user-resolver.service';
import {
  BotCommandType,
  BotResponseType,
  CredentialPlatform,
} from '@genfeedai/enums';
import type {
  IBotCallbackContext,
  IBotMessage,
  IBotPlatformAdapter,
  IBotResponse,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class BotGatewayService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly settingsUrl: string;

  private readonly adapters: Map<CredentialPlatform, IBotPlatformAdapter>;

  /**
   * Expose generation service for callback context checks
   * Used by WebhooksService to check if generation was bot-triggered
   */
  public readonly generationService: BotGenerationService;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly discordAdapter: DiscordBotAdapter,
    private readonly slackAdapter: SlackBotAdapter,
    private readonly telegramAdapter: TelegramBotAdapter,
    private readonly userResolverService: BotUserResolverService,
    generationService: BotGenerationService,
  ) {
    this.settingsUrl = `${this.configService.get('APP_URL')}/settings/organization/credentials#telegram-integration`;
    this.generationService = generationService;
    // Register adapters
    this.adapters = new Map();
    this.adapters.set(CredentialPlatform.DISCORD, this.discordAdapter);
    this.adapters.set(CredentialPlatform.SLACK, this.slackAdapter);
    this.adapters.set(CredentialPlatform.TELEGRAM, this.telegramAdapter);
  }

  /**
   * Get adapter for a platform
   */
  getAdapter(platform: CredentialPlatform): IBotPlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * Handle Discord ping interaction (required for Discord bot verification)
   */
  handlePing(platform: CredentialPlatform): { type: number } {
    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new HttpException(
        { detail: 'Unsupported platform', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return adapter.buildImmediateResponse(BotResponseType.PONG) as {
      type: number;
    };
  }

  /**
   * Handle incoming bot interaction
   */
  async handleInteraction(
    platform: CredentialPlatform,
    body: unknown,
  ): Promise<IBotResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const adapter = this.getAdapter(platform);
    if (!adapter) {
      throw new HttpException(
        { detail: 'Unsupported platform', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Parse the message
    const message = await adapter.parseMessage(body);
    if (!message) {
      this.loggerService.warn(`${url} could not parse message`);
      return {
        message: 'Could not understand the command',
        type: 'error',
      };
    }

    this.loggerService.log(`${url} processing command`, {
      command: message.command,
      platform,
      platformUserId: message.platformUserId,
    });

    // Route to appropriate handler
    switch (message.command) {
      case BotCommandType.PROMPT_IMAGE:
      case BotCommandType.PROMPT_VIDEO:
        return this.handleGenerationCommand(message);

      case BotCommandType.SET_BRAND:
        return this.handleSetBrandCommand(message);

      case BotCommandType.STATUS:
        return this.handleStatusCommand(message);

      default:
        return {
          message: 'Unknown command',
          type: 'error',
        };
    }
  }

  /**
   * Handle image/video generation commands
   */
  private async handleGenerationCommand(
    message: IBotMessage,
  ): Promise<IBotResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Validate prompt
    if (!message.prompt || message.prompt.trim().length === 0) {
      return {
        message:
          'Please provide a prompt. Usage: `/prompt-image your description here`',
        type: 'text',
      };
    }

    // Resolve user from platform credentials
    const resolvedUser = await this.userResolverService.resolveUserWithBrand(
      message.platform,
      message.platformUserId,
      message.brandName,
    );

    if (!resolvedUser) {
      return {
        message: `Your account is not connected. Please link your ${this.getPlatformLabel(
          message.platform,
        )} account at:\n${this.settingsUrl}`,
        type: 'text',
      };
    }

    // Check credits
    const creditCost = this.generationService.getCreditCost(message.command);
    const { hasCredits, balance } = await this.generationService.checkCredits(
      resolvedUser.organizationId,
      creditCost,
    );

    if (!hasCredits) {
      return {
        message: `Insufficient credits. You have ${balance} credits, but ${creditCost} are required.\nAdd more credits at: ${this.settingsUrl}/billing`,
        type: 'text',
      };
    }

    // Create callback context
    const callbackContext: IBotCallbackContext = {
      applicationId: message.applicationId || '',
      chatId: message.chatId,
      interactionToken: message.interactionToken || '',
      platform: message.platform,
    };

    // Trigger generation
    try {
      const result = await this.generationService.triggerGeneration(
        resolvedUser,
        message.command,
        message.prompt,
        callbackContext,
      );

      this.loggerService.log(`${url} generation triggered`, {
        ingredientId: result.ingredientId,
      });

      return {
        message: result.message,
        type: 'deferred',
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} generation failed`, error);
      return {
        message: 'Failed to start generation. Please try again later.',
        type: 'error',
      };
    }
  }

  /**
   * Handle set-brand command
   */
  private async handleSetBrandCommand(
    message: IBotMessage,
  ): Promise<IBotResponse> {
    if (!message.brandName) {
      return {
        message:
          'Please specify a brand name. Usage: `/set-brand your-brand-name`',
        type: 'text',
      };
    }

    // Resolve user
    const resolvedUser = await this.userResolverService.resolveUser(
      message.platform,
      message.platformUserId,
    );

    if (!resolvedUser) {
      return {
        message: `Your account is not connected. Please link your ${this.getPlatformLabel(
          message.platform,
        )} account at:\n${this.settingsUrl}`,
        type: 'text',
      };
    }

    // Try to find brand by name
    const userWithBrand = await this.userResolverService.resolveUserWithBrand(
      message.platform,
      message.platformUserId,
      message.brandName,
    );

    if (!userWithBrand || userWithBrand.brandId === resolvedUser.brandId) {
      // Brand not found or same as current
      const brands = await this.userResolverService.getUserBrands(
        resolvedUser.organizationId,
      );
      const brandList = brands.map((b) => `• ${b.name}`).join('\n');

      return {
        message: `Brand "${message.brandName}" not found. Available brands:\n${brandList}`,
        type: 'text',
      };
    }

    return {
      message: `Active brand set to: **${message.brandName}**\nFuture generations will use this brand's settings.`,
      type: 'text',
    };
  }

  /**
   * Handle status command
   */
  private async handleStatusCommand(
    message: IBotMessage,
  ): Promise<IBotResponse> {
    // Resolve user
    const resolvedUser = await this.userResolverService.resolveUser(
      message.platform,
      message.platformUserId,
    );

    if (!resolvedUser) {
      return {
        message: `Your account is not connected. Please link your ${this.getPlatformLabel(
          message.platform,
        )} account at:\n${this.settingsUrl}`,
        type: 'text',
      };
    }

    // Get user's brands and credits
    const brands = await this.userResolverService.getUserBrands(
      resolvedUser.organizationId,
    );

    const { balance } = await this.generationService.checkCredits(
      resolvedUser.organizationId,
      0,
    );

    const currentBrand = brands.find((b) => b.id === resolvedUser.brandId);
    const brandList = brands
      .map(
        (b) => `• ${b.name}${b.id === resolvedUser.brandId ? ' (active)' : ''}`,
      )
      .join('\n');

    return {
      message: `**Account Status**\n\nCredits: ${balance}\nActive Brand: ${currentBrand?.name || 'Unknown'}\n\n**Available Brands:**\n${brandList}`,
      type: 'text',
    };
  }

  /**
   * Send follow-up response after generation completes
   * Called by webhook handlers when generation finishes
   */
  async sendCompletionResponse(
    ingredientId: string,
    resultUrl: string,
    mediaType: 'image' | 'video',
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const context = this.generationService.getCallbackContext(ingredientId);
    if (!context) {
      this.loggerService.warn(`${url} no callback context for ingredient`, {
        ingredientId,
      });
      return;
    }

    const adapter = this.getAdapter(context.platform);
    if (!adapter) {
      this.loggerService.error(`${url} no adapter for platform`, {
        platform: context.platform,
      });
      return;
    }

    try {
      await adapter.sendFollowupMedia(
        context.applicationId,
        context.interactionToken,
        resultUrl,
        mediaType,
        `Here's your generated ${mediaType}!`,
      );

      this.loggerService.log(`${url} sent completion response`, {
        ingredientId,
        mediaType,
      });

      // Clean up context
      this.generationService.removeCallbackContext(ingredientId);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send completion`, error);
    }
  }

  /**
   * Send error response for failed generation
   */
  async sendErrorResponse(
    ingredientId: string,
    errorMessage: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const context = this.generationService.getCallbackContext(ingredientId);
    if (!context) {
      this.loggerService.warn(`${url} no callback context for ingredient`, {
        ingredientId,
      });
      return;
    }

    const adapter = this.getAdapter(context.platform);
    if (!adapter) {
      this.loggerService.error(`${url} no adapter for platform`, {
        platform: context.platform,
      });
      return;
    }

    try {
      await adapter.sendFollowupMessage(
        context.applicationId,
        context.interactionToken,
        `Generation failed: ${errorMessage}`,
      );

      this.loggerService.log(`${url} sent error response`, {
        ingredientId,
      });

      // Clean up context
      this.generationService.removeCallbackContext(ingredientId);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send error response`, error);
    }
  }

  private getPlatformLabel(platform: CredentialPlatform): string {
    switch (platform) {
      case CredentialPlatform.DISCORD:
        return 'Discord';
      case CredentialPlatform.SLACK:
        return 'Slack';
      case CredentialPlatform.TELEGRAM:
        return 'Telegram';
      default:
        return 'platform';
    }
  }
}
