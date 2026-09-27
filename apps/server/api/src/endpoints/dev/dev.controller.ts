import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { categoryToPlural, IngredientCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

@AutoSwagger()
@Controller('dev')
export class DevController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly ingredientsService: IngredientsService,
  ) {
    if (this.configService.isProduction) {
      this.loggerService.warn(
        `${this.constructorName} is disabled in production`,
      );
    }
  }

  /**
   * Test Discord card by sending a real ingredient to the webhook
   * Fetches the ingredient and sends its card through the durable outbox
   *
   * Body: { ingredientId: string }
   */
  @HttpCode(200)
  @Post('discord')
  async debugDiscordCard(@Body() body: { ingredientId: string }) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (this.configService.isProduction) {
      throw new HttpException(
        'This endpoint is only available in development mode',
        HttpStatus.FORBIDDEN,
      );
    }

    this.loggerService.log(`${url} started`, body);

    try {
      const { ingredientId } = body;

      if (!ingredientId) {
        throw new HttpException(
          'ingredientId is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Include the relations required by the Discord preview card.
      const ingredient = await this.ingredientsService.findOne(
        { id: ingredientId },
        [
          { path: 'prompt', select: ['original'] },
          {
            path: 'metadata',
            select: [
              'width',
              'height',
              'duration',
              'model',
              'externalProvider',
              'hasAudio',
            ],
          },
        ],
      );

      if (!ingredient) {
        throw new HttpException('Ingredient not found', HttpStatus.NOT_FOUND);
      }

      const category = ingredient.category as IngredientCategory;
      const cdnUrl = `${this.configService.ingredientsEndpoint}/${categoryToPlural(category)}/${ingredient.id}`;

      // A fresh deduplication key per request: every test sends a card.
      await this.activityRecorder.dispatch({
        deduplicationKey: `dev/discord/${ingredient.id}/${Date.now()}`,
        messages: [
          {
            destination: null,
            message: {
              action: 'ingredient_notification',
              payload: {
                category,
                cdnUrl,
                ingredient: {
                  id: ingredient.id,
                  metadata: ingredient.metadata ?? undefined,
                  // The Discord card renders `prompt.original`, so it needs
                  // the populated object, not the id.
                  // relation-alias-ok: explicitly populated in the query above.
                  prompt: ingredient.prompt ?? undefined,
                },
              },
              type: 'discord',
            },
          },
        ],
        organizationId: ingredient.organizationId,
        source: { id: ingredient.id, type: 'ingredient' },
        topic: 'operator.alerts',
      });

      this.loggerService.log(`${url} completed`, {
        category,
        cdnUrl,
        ingredientId,
      });

      return {
        data: {
          category,
          cdnUrl,
          ingredientId,
        },
        message: `Discord ${category} card sent successfully`,
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          error: (error as Error)?.message || 'Unknown error',
          message: 'Failed to send Discord card',
          success: false,
        },
        (error as { status?: number })?.status ??
          HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
