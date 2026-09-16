import { BotCallbackContextService } from '@api/services/bot-gateway/services/bot-callback-context.service';
import { BotPlatformAdapterRegistryService } from '@api/services/bot-gateway/services/bot-platform-adapter-registry.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * Answers a bot interaction once its generation finishes. Called by the
 * webhook media path, so it depends only on the platform adapters and the
 * Redis-backed callback store — never on the generation dispatcher.
 */
@Injectable()
export class BotCallbackResponderService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly adapterRegistry: BotPlatformAdapterRegistryService,
    private readonly callbackContextService: BotCallbackContextService,
    private readonly loggerService: LoggerService,
  ) {}

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

    const context = await this.callbackContextService.get(ingredientId);
    if (!context) {
      return;
    }

    const adapter = this.adapterRegistry.getAdapter(context.platform);
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
      await this.callbackContextService.remove(ingredientId);
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

    const context = await this.callbackContextService.get(ingredientId);
    if (!context) {
      return;
    }

    const adapter = this.adapterRegistry.getAdapter(context.platform);
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
      await this.callbackContextService.remove(ingredientId);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send error response`, error);
    }
  }
}
