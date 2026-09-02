import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  BOT_MEDIA_GENERATION_DISPATCHER,
  type BotMediaGenerationDispatcher,
} from '@api/services/bot-gateway/services/bot-media-generation-dispatcher.interface';
import {
  BotCommandType,
  CredentialPlatform,
  IngredientCategory,
} from '@genfeedai/enums';
import type {
  IBotCallbackContext,
  IBotResolvedUser,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

interface GenerationResult {
  ingredientId: string;
  message: string;
}

const CALLBACK_CONTEXT_TTL_SECONDS = 24 * 60 * 60;
const CALLBACK_CONTEXT_KEY_PREFIX = 'bot-generation:callback';
const BOT_PLATFORMS = new Set<string>([
  CredentialPlatform.DISCORD,
  CredentialPlatform.SLACK,
  CredentialPlatform.TELEGRAM,
]);

@Injectable()
export class BotGenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
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
        await this.storeCallbackContext(ingredientId, callbackContext);
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

  async getCallbackContext(
    ingredientId: string,
  ): Promise<IBotCallbackContext | undefined> {
    const stored = await this.redisClient().get(this.callbackKey(ingredientId));
    if (!stored) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(stored);
    return this.isCallbackContext(parsed) ? parsed : undefined;
  }

  async removeCallbackContext(ingredientId: string): Promise<void> {
    await this.redisClient().unlink(this.callbackKey(ingredientId));
  }

  /**
   * Get ingredient result URL for completed generation
   */
  getIngredientUrl(ingredientId: string, category: IngredientCategory): string {
    const type = category === IngredientCategory.IMAGE ? 'images' : 'videos';
    return `${this.configService.ingredientsEndpoint}/${type}/${ingredientId}`;
  }

  private callbackKey(ingredientId: string): string {
    return `${CALLBACK_CONTEXT_KEY_PREFIX}:${ingredientId}`;
  }

  private isCallbackContext(value: unknown): value is IBotCallbackContext {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const context = value as Record<string, unknown>;
    return (
      typeof context.applicationId === 'string' &&
      typeof context.chatId === 'string' &&
      typeof context.interactionToken === 'string' &&
      typeof context.platform === 'string' &&
      BOT_PLATFORMS.has(context.platform)
    );
  }

  private redisClient() {
    const client = this.redisService.getPublisher();
    if (!client) {
      throw new ServiceUnavailableException(
        'Bot generation callbacks require Redis to be configured',
      );
    }
    return client;
  }

  private async storeCallbackContext(
    ingredientId: string,
    callbackContext: IBotCallbackContext,
  ): Promise<void> {
    await this.redisClient().setex(
      this.callbackKey(ingredientId),
      CALLBACK_CONTEXT_TTL_SECONDS,
      JSON.stringify({ ...callbackContext, ingredientId }),
    );
  }
}
