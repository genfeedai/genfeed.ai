import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ConfigService } from '@api/config/config.service';
import { getErrorMessage } from '@api/helpers/utils/error/get-error-message.util';
import { UserExtractionUtil } from '@api/helpers/utils/user-extraction/user-extraction.util';
import { BotGatewayService } from '@api/services/bot-gateway/bot-gateway.service';
import { EvaluationType, IngredientCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class PostProcessingOrchestratorService {
  private readonly logContext = 'PostProcessingOrchestratorService';

  constructor(
    private readonly botGatewayService: BotGatewayService,
    private readonly configService: ConfigService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly loggerService: LoggerService,
    @Optional() private readonly evaluationsService?: EvaluationsService,
  ) {}

  /**
   * Notify bot gateway if this was a bot-triggered generation.
   * Fire-and-forget — does not block caller.
   */
  notifyBotGatewayIfNeeded(
    ingredientId: string,
    category: IngredientCategory,
  ): void {
    (async () => {
      try {
        const context =
          this.botGatewayService.generationService?.getCallbackContext(
            ingredientId,
          );

        if (!context) {
          return;
        }

        const mediaType =
          category === IngredientCategory.IMAGE ? 'image' : 'video';
        const resultUrl = `${this.configService.ingredientsEndpoint}/${mediaType}s/${ingredientId}`;

        await this.botGatewayService.sendCompletionResponse(
          ingredientId,
          resultUrl,
          mediaType,
        );

        this.loggerService.log(`${this.logContext} bot notification sent`, {
          ingredientId,
          mediaType,
        });
      } catch (error: unknown) {
        this.loggerService.error(
          `${this.logContext} notifyBotGatewayIfNeeded failed`,
          error,
        );
      }
    })();
  }

  /**
   * Trigger auto-evaluation if enabled for the organization.
   * Runs in background to not block webhook response.
   */
  triggerAutoEvaluationIfEnabled(ingredient: IngredientDocument): void {
    setImmediate(() => {
      this.triggerAutoEvaluationAsync(ingredient).catch((error: unknown) => {
        this.loggerService.error(`${this.logContext} auto-evaluation failed`, {
          error: getErrorMessage(error),
          ingredientId: ingredient._id,
        });
      });
    });
  }

  private async triggerAutoEvaluationAsync(
    ingredient: IngredientDocument,
  ): Promise<void> {
    if (!this.evaluationsService) {
      this.loggerService.debug(
        `${this.logContext} EvaluationsService not available`,
        { ingredientId: ingredient._id },
      );
      return;
    }

    const orgSettings = await this.organizationSettingsService.findOne({
      organization: ingredient.organization,
    });

    if (!orgSettings?.isAutoEvaluateEnabled) {
      this.loggerService.debug(`${this.logContext} auto-evaluate disabled`, {
        ingredientId: ingredient._id,
        organizationId: ingredient.organization,
      });
      return;
    }

    const supportedCategories = [
      IngredientCategory.IMAGE,
      IngredientCategory.VIDEO,
    ];

    if (
      !supportedCategories.includes(ingredient.category as IngredientCategory)
    ) {
      this.loggerService.debug(
        `${this.logContext} category not supported for auto-evaluation`,
        {
          category: ingredient.category,
          ingredientId: ingredient._id,
        },
      );
      return;
    }

    const { userId } = UserExtractionUtil.extractUserIds(ingredient.user);
    if (!userId) {
      this.loggerService.warn(
        `${this.logContext} no userId for auto-evaluation`,
        { ingredientId: ingredient._id },
      );
      return;
    }

    const brandId = UserExtractionUtil.extractBrandId(ingredient.brand);
    if (!brandId) {
      this.loggerService.debug(
        `${this.logContext} no brandId for auto-evaluation, skipping`,
        { ingredientId: ingredient._id },
      );
      return;
    }

    await this.evaluationsService.evaluateContent(
      ingredient.category as IngredientCategory,
      String(ingredient._id),
      EvaluationType.PRE_PUBLICATION,
      String(ingredient.organization),
      userId,
      brandId,
    );

    this.loggerService.log(`${this.logContext} auto-evaluation triggered`, {
      category: ingredient.category,
      ingredientId: ingredient._id,
    });
  }
}
