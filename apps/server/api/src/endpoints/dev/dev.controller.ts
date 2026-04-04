import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ConfigService } from '@api/config/config.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { IngredientCategory } from '@genfeedai/enums';
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
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('dev')
export class DevController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly notificationsService: NotificationsService,
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
   * Fetches ingredient from DB and sends notification through Redis pub/sub
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

      // Fetch real ingredient from DB
      const ingredient = await this.ingredientsService.findOne({
        _id: new Types.ObjectId(ingredientId),
      });

      if (!ingredient) {
        throw new HttpException('Ingredient not found', HttpStatus.NOT_FOUND);
      }

      const category = ingredient.category as IngredientCategory;
      const cdnUrl = `${this.configService.ingredientsEndpoint}/${category}s/${ingredient._id}`;

      // Send via Redis pub/sub to notifications service
      await this.notificationsService.sendNotification({
        action: 'ingredient_notification',
        payload: {
          category,
          cdnUrl,
          ingredient: {
            _id: ingredient._id.toString(),
            metadata: ingredient.metadata,
            prompt: ingredient.prompt,
          },
        },
        type: 'discord',
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
