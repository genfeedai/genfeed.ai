import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { UserExtractionUtil } from '@api/helpers/utils/user-extraction/user-extraction.util';
import { BotGatewayService } from '@api/services/bot-gateway/bot-gateway.service';
import { resolveRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import { EvaluationType, IngredientCategory } from '@genfeedai/enums';
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

    // Scalar FK first, and fail closed. `organization` is a Mongo-era relation
    // alias that is only an id string while `BaseService.normalizeDocument`
    // back-fills it; when it is `undefined` the filter value is dropped by
    // `normalizeWhere`, turning this tenant-scoped lookup into an unscoped
    // `findFirst` that reads another organization's auto-evaluate setting —
    // and then feeds that foreign id into `evaluateContent` below.
    const organizationId = resolveRelationId(
      ingredient.organizationId,
      ingredient.organization,
    );

    if (!organizationId) {
      this.loggerService.error(
        `${this.logContext} ingredient is missing an organization id`,
        { ingredientId: ingredient.id },
      );
      return;
    }

    const orgSettings = await this.organizationSettingsService.findOne({
      organization: organizationId,
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

    const { userId } = UserExtractionUtil.extractUserIds(ingredient.user);
    if (!userId) {
      this.loggerService.warn(
        `${this.logContext} no userId for auto-evaluation`,
        { ingredientId: ingredient.id },
      );
      return;
    }

    const brandId = UserExtractionUtil.extractBrandId(ingredient.brand);
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
