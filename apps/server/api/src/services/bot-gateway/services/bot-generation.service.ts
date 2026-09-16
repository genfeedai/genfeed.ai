import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { BotCallbackContextService } from '@api/services/bot-gateway/services/bot-callback-context.service';
import {
  BOT_MEDIA_GENERATION_DISPATCHER,
  type BotMediaGenerationDispatcher,
} from '@api/services/bot-gateway/services/bot-media-generation-dispatcher.interface';
import { BotCommandType, IngredientCategory } from '@genfeedai/contracts';
import type {
  IBotCallbackContext,
  IBotResolvedUser,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Inject, Injectable } from '@nestjs/common';

interface GenerationResult {
  ingredientId: string;
  message: string;
}

@Injectable()
export class BotGenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly callbackContextService: BotCallbackContextService,
    private readonly configService: ConfigService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly loggerService: LoggerService,
    @Inject(BOT_MEDIA_GENERATION_DISPATCHER)
    private readonly mediaGenerationDispatcher: BotMediaGenerationDispatcher,
  ) {}

  /**
   * Check if user has enough credits for generation
   */
  async checkCredits(
    organizationId: string,
    requiredCredits: number,
  ): Promise<{ hasCredits: boolean; balance: number }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        );

      const hasCredits = balance >= requiredCredits;

      this.loggerService.log(`${url} credit check`, {
        balance,
        hasCredits,
        organizationId,
        requiredCredits,
      });

      return { balance, hasCredits };
    } catch (error: unknown) {
      this.loggerService.error(`${url} credit check failed`, error);
      return { balance: 0, hasCredits: false };
    }
  }

  async triggerGeneration(
    resolvedUser: IBotResolvedUser,
    command: BotCommandType,
    prompt: string,
    callbackContext: IBotCallbackContext,
  ): Promise<GenerationResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(`${url} starting generation`, {
      brandId: resolvedUser.brandId,
      command,
      organizationId: resolvedUser.organizationId,
      promptPreview: prompt.substring(0, 100),
    });

    const isImage = command === BotCommandType.PROMPT_IMAGE;
    const result = await this.mediaGenerationDispatcher.generate({
      command,
      onPlaceholderCreated: async (ingredientId) => {
        await this.callbackContextService.store(ingredientId, callbackContext);
      },
      prompt,
      user: resolvedUser,
    });

    this.loggerService.log(`${url} generation dispatched`, {
      ingredientId: result.ingredientId,
    });

    return {
      ingredientId: result.ingredientId,
      message: `Generating your ${isImage ? 'image' : 'video'}...`,
    };
  }

  /**
   * Get ingredient result URL for completed generation
   */
  getIngredientUrl(ingredientId: string, category: IngredientCategory): string {
    const type = category === IngredientCategory.IMAGE ? 'images' : 'videos';
    return `${this.configService.ingredientsEndpoint}/${type}/${ingredientId}`;
  }
}
