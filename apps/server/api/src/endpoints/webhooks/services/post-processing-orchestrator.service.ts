import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { BotGatewayService } from '@api/services/bot-gateway/bot-gateway.service';
import { EvaluationType, IngredientCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
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
        const mediaType =
          category === IngredientCategory.IMAGE ? 'image' : 'video';
        const resultUrl = `${this.configService.ingredientsEndpoint}/${mediaType}s/${ingredientId}`;

        await this.botGatewayService.sendCompletionResponse(
          ingredientId,
          resultUrl,
          mediaType,
        );
      } catch (error: unknown) {
        this.loggerService.error(
          `${this.logContext} notifyBotGatewayIfNeeded failed`,
          error,
        );
      }
    })();
  }

  notifyBotGatewayFailureIfNeeded(
    ingredientId: string,
    errorMessage: string,
  ): void {
    setImmediate(() => {
      this.botGatewayService
        .sendErrorResponse(ingredientId, errorMessage)
        .catch((error: unknown) => {
          this.loggerService.error(
            `${this.logContext} bot failure notification failed`,
            error,
          );
        });
    });
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
          ingredientId: ingredient.id,
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
        { ingredientId: ingredient.id },
      );
      return;
    }

    // Fail closed before issuing a tenant-scoped lookup without its scalar FK.
    const organizationId = ingredient.organizationId;

    if (!organizationId) {
      this.loggerService.error(
        `${this.logContext} ingredient is missing an organization id`,
        { ingredientId: ingredient.id },
      );
      return;
    }

    const orgSettings = await this.organizationSettingsService.findOne({
      organizationId: organizationId,
    });

    if (!orgSettings?.isAutoEvaluateEnabled) {
      this.loggerService.debug(`${this.logContext} auto-evaluate disabled`, {
        ingredientId: ingredient.id,
        organizationId,
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
          ingredientId: ingredient.id,
        },
      );
      return;
    }

    const userId = ingredient.userId;
    if (!userId) {
      this.loggerService.warn(
        `${this.logContext} no userId for auto-evaluation`,
        { ingredientId: ingredient.id },
      );
      return;
    }

    const brandId = ingredient.brandId ?? undefined;
    if (!brandId) {
      this.loggerService.debug(
        `${this.logContext} no brandId for auto-evaluation, skipping`,
        { ingredientId: ingredient.id },
      );
      return;
    }

    await this.evaluationsService.evaluateContent(
      ingredient.category as IngredientCategory,
      String(ingredient.id),
      EvaluationType.PRE_PUBLICATION,
      organizationId,
      userId,
      brandId,
    );

    this.loggerService.log(`${this.logContext} auto-evaluation triggered`, {
      category: ingredient.category,
      ingredientId: ingredient.id,
    });
  }
}
