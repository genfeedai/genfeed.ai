import {
  BotCallbackContextService,
  type ClaimedBotCallbackContext,
} from '@api/services/bot-gateway/services/bot-callback-context.service';
import { BotPlatformAdapterRegistryService } from '@api/services/bot-gateway/services/bot-platform-adapter-registry.service';
import type { IBotPlatformAdapter } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

type ClaimedDelivery = {
  adapter: IBotPlatformAdapter;
  claimed: ClaimedBotCallbackContext;
};

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
    const delivery = await this.claimDelivery(ingredientId, url);
    if (!delivery) {
      return;
    }

    try {
      await delivery.adapter.sendFollowupMedia(
        delivery.claimed.context.applicationId,
        delivery.claimed.context.interactionToken,
        resultUrl,
        mediaType,
        `Here's your generated ${mediaType}!`,
      );

      this.loggerService.log(`${url} sent completion response`, {
        ingredientId,
        mediaType,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send completion`, error);
      await this.restoreClaimed(url, ingredientId, delivery.claimed);
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
    const delivery = await this.claimDelivery(ingredientId, url);
    if (!delivery) {
      return;
    }

    try {
      await delivery.adapter.sendFollowupMessage(
        delivery.claimed.context.applicationId,
        delivery.claimed.context.interactionToken,
        `Generation failed: ${errorMessage}`,
      );

      this.loggerService.log(`${url} sent error response`, {
        ingredientId,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send error response`, error);
      await this.restoreClaimed(url, ingredientId, delivery.claimed);
    }
  }

  /**
   * Claim first: the platform lives on the record, so adapter resolution
   * cannot precede consume. A missing adapter never reached the platform and
   * restores; two racers still cannot both deliver.
   */
  private async claimDelivery(
    ingredientId: string,
    url: string,
  ): Promise<ClaimedDelivery | undefined> {
    const claimed = await this.callbackContextService.claim(ingredientId);
    if (!claimed) {
      return undefined;
    }

    const adapter = this.adapterRegistry.getAdapter(claimed.context.platform);
    if (!adapter) {
      this.loggerService.error(`${url} no adapter for platform`, {
        platform: claimed.context.platform,
      });
      await this.restoreClaimed(url, ingredientId, claimed);
      return undefined;
    }

    return { adapter, claimed };
  }

  private async restoreClaimed(
    url: string,
    ingredientId: string,
    claimed: ClaimedBotCallbackContext,
  ): Promise<void> {
    try {
      if (claimed.remainingTtlMs !== -1 && claimed.remainingTtlMs < 1) {
        this.loggerService.warn(
          `${url} not restoring expired callback context`,
          { ingredientId },
        );
        return;
      }

      this.loggerService.warn(
        `${url} restoring callback context after failed delivery`,
        { ingredientId },
      );

      const restored = await this.callbackContextService.restore(
        ingredientId,
        claimed,
      );
      if (!restored) {
        this.loggerService.warn(`${url} abandoned callback context restore`, {
          ingredientId,
        });
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to restore callback context`, {
        error,
        ingredientId,
      });
    }
  }
}
