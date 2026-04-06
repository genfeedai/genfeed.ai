import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { ConfigService } from '@api/config/config.service';
import { resolveGenerationDefaultModel } from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivitySource,
  BotCommandType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import type {
  IBotCallbackContext,
  IBotResolvedUser,
} from '@genfeedai/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

interface GenerationResult {
  ingredientId: string;
  message: string;
}

interface SyntheticUser {
  id: string;
  publicMetadata: {
    user: string;
    brand: string;
    organization: string;
  };
}

@Injectable()
export class BotGenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  /**
   * In-memory store for bot callback contexts
   * Key: ingredientId, Value: callback context for sending response
   *
   * NOTE: For production, this should be moved to Redis for multi-instance support
   */
  private readonly callbackContexts = new Map<string, IBotCallbackContext>();

  constructor(
    private readonly configService: ConfigService,
    private readonly brandsService: BrandsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    readonly _ingredientsService: IngredientsService,
    readonly _metadataService: MetadataService,
    private readonly sharedService: SharedService,
    private readonly loggerService: LoggerService,
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

  /**
   * Get credit cost for generation type
   */
  getCreditCost(command: BotCommandType): number {
    switch (command) {
      case BotCommandType.PROMPT_IMAGE:
        return 5; // Standard image generation cost
      case BotCommandType.PROMPT_VIDEO:
        return 20; // Video generation is more expensive
      default:
        return 0;
    }
  }

  /**
   * Trigger content generation from bot command
   */
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

    try {
      // Get brand for default model
      const brand = await this.brandsService.findOne({
        _id: new Types.ObjectId(resolvedUser.brandId),
        isDeleted: false,
      });

      if (!brand) {
        throw new Error('Brand not found');
      }

      // Determine category and model based on command
      const isImage = command === BotCommandType.PROMPT_IMAGE;
      const category = isImage
        ? IngredientCategory.IMAGE
        : IngredientCategory.VIDEO;
      const organizationSettings =
        await this.organizationSettingsService.findOne({
          isDeleted: false,
          organization: new Types.ObjectId(resolvedUser.organizationId),
        });
      const defaultModel = isImage
        ? resolveGenerationDefaultModel<string>({
            brandDefault: brand.defaultImageModel as string | undefined,
            organizationDefault: organizationSettings?.defaultImageModel as
              | string
              | undefined,
            systemDefault: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
          })
        : resolveGenerationDefaultModel<string>({
            brandDefault: brand.defaultVideoModel as string | undefined,
            organizationDefault: organizationSettings?.defaultVideoModel as
              | string
              | undefined,
            systemDefault: 'replicate_kling_video' as unknown as string,
          });

      // Create synthetic user object for SharedService
      const syntheticUser: SyntheticUser = {
        id: resolvedUser.userId,
        publicMetadata: {
          brand: resolvedUser.brandId,
          organization: resolvedUser.organizationId,
          user: resolvedUser.userId,
        },
      };

      // Create ingredient with PROCESSING status
      const { ingredientData, metadataData } =
        await this.sharedService.saveDocuments(
          syntheticUser as unknown as User,
          {
            brand: new Types.ObjectId(resolvedUser.brandId),
            category,
            extension: isImage ? MetadataExtension.JPEG : MetadataExtension.MP4,
            model: defaultModel,
            organization: new Types.ObjectId(resolvedUser.organizationId),
            prompt,
            status: IngredientStatus.PROCESSING,
            text: prompt,
            user: new Types.ObjectId(resolvedUser.userId),
          },
        );

      // Store callback context for when generation completes
      const contextWithIngredient: IBotCallbackContext = {
        ...callbackContext,
        ingredientId: ingredientData._id.toString(),
      };
      this.callbackContexts.set(
        ingredientData._id.toString(),
        contextWithIngredient,
      );

      // Deduct credits
      const creditCost = this.getCreditCost(command);
      if (creditCost > 0) {
        await this.creditsUtilsService.deductCreditsFromOrganization(
          resolvedUser.organizationId,
          resolvedUser.userId,
          creditCost,
          `Bot ${isImage ? 'image' : 'video'} generation`,
          ActivitySource.BOT_GENERATION,
        );
      }

      this.loggerService.log(`${url} ingredient created`, {
        ingredientId: ingredientData._id.toString(),
        metadataId: metadataData._id.toString(),
      });

      // NOTE: The actual AI generation call would go here
      // For now, we've created the placeholder - the existing webhook infrastructure
      // (like Replicate webhooks) will update the ingredient when generation completes

      return {
        ingredientId: ingredientData._id.toString(),
        message: `Generating your ${isImage ? 'image' : 'video'}...`,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} generation failed`, error);
      throw error;
    }
  }

  /**
   * Get callback context for an ingredient (called when generation completes)
   */
  getCallbackContext(ingredientId: string): IBotCallbackContext | undefined {
    return this.callbackContexts.get(ingredientId);
  }

  /**
   * Remove callback context after response is sent
   */
  removeCallbackContext(ingredientId: string): void {
    this.callbackContexts.delete(ingredientId);
  }

  /**
   * Get ingredient result URL for completed generation
   */
  getIngredientUrl(ingredientId: string, category: IngredientCategory): string {
    const type = category === IngredientCategory.IMAGE ? 'images' : 'videos';
    return `${this.configService.ingredientsEndpoint}/${type}/${ingredientId}`;
  }
}
