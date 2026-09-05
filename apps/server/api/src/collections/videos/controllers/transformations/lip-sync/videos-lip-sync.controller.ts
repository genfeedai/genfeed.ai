import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CreateLipSyncDto } from '@api/collections/videos/dto/create-lip-sync.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ActivitySource,
  ByokProvider,
  categoryToPlural,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
@UseGuards(SubscriptionGuard, CreditsGuard)
export class VideosLipSyncController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly byokService: ByokService,
    private readonly configService: ConfigService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly heygenService: HeyGenService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Post('lip-sync')
  // Fixed 1-credit charge, matching the sibling HeyGen route POST /videos/avatar.
  // Charged through the standard CreditsGuard (balance gate) + CreditsInterceptor
  // (deducts on success) path used across the API — replacing the previous
  // manual inline credit deduction call, which double-tracked the
  // charge outside the interceptor and diverged from every other credited route.
  // Using a fixed `amount` (not `modelKey`) also avoids the CreditsGuard model
  // lookup, so the route no longer depends on a `heygen/avatar` models-table row.
  @Credits({
    amount: 1,
    description: 'Lip-sync photo avatar video generation',
    source: ActivitySource.VIDEO_GENERATION,
  })
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createLipSyncVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createLipSyncDto: CreateLipSyncDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let ingredientId: string | undefined;

    try {
      const imageIngredient = await this.resolveImageIngredient(
        createLipSyncDto.parent,
        user.organizationId,
      );
      const audioIngredient = await this.resolveAudioIngredient(
        createLipSyncDto.voice,
        user.organizationId,
      );
      const { metadataData, ingredientData } =
        await this.sharedService.createMediaDocuments(user, {
          brandId: imageIngredient.brandId ?? user.brandId,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          model: MODEL_KEYS.HEYGEN_AVATAR,
          organizationId: user.organizationId,
          parentId: createLipSyncDto.parent,
          // Store references for traceability
          sourceIds: [createLipSyncDto.parent, createLipSyncDto.voice],
          status: IngredientStatus.PROCESSING,
        });

      ingredientId = String(ingredientData.id);
      await this.dispatchLipSyncGeneration(
        user,
        createLipSyncDto,
        imageIngredient,
        audioIngredient,
        ingredientId,
        metadataData.id,
        url,
      );

      return serializeSingle(request, IngredientSerializer, ingredientData);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      // If ingredient was created but generation failed, mark as failed
      if (ingredientId) {
        const websocketUrl = WebSocketPaths.video(ingredientId);
        await this.failedGenerationService.handleFailedVideoGeneration(
          this.videosService,
          ingredientId,
          websocketUrl,
          user.id,
          getUserRoomName(user.id),
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      const errorWithMessage = error as { message?: string };
      throw new HttpException(
        {
          detail:
            errorWithMessage.message ||
            'An error occurred while generating lip-sync video',
          title: 'Lip-sync video generation failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async resolveImageIngredient(
    ingredientId: string,
    organizationId: string,
  ): Promise<IngredientDocument> {
    const ingredient = await this.ingredientsService.findOne({
      id: ingredientId,
      organizationId,
    });
    if (!ingredient) {
      throw new HttpException(
        {
          detail: `Image ingredient with ID ${ingredientId} not found`,
          title: 'Image not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    if (String(ingredient.category) !== IngredientCategory.IMAGE) {
      throw new HttpException(
        {
          detail: `Expected image ingredient, got ${ingredient.category}`,
          title: 'Invalid ingredient type',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    this.assertIngredientReady(ingredient, 'Image');
    return ingredient;
  }

  private async resolveAudioIngredient(
    ingredientId: string,
    organizationId: string,
  ): Promise<IngredientDocument> {
    const ingredient = await this.ingredientsService.findOne({
      id: ingredientId,
      organizationId,
    });
    if (!ingredient) {
      throw new HttpException(
        {
          detail: `Audio ingredient with ID ${ingredientId} not found`,
          title: 'Audio not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      String(ingredient.category) !== IngredientCategory.AUDIO &&
      String(ingredient.category) !== IngredientCategory.VIDEO
    ) {
      throw new HttpException(
        {
          detail: `Expected audio or video ingredient, got ${ingredient.category}`,
          title: 'Invalid ingredient type',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    this.assertIngredientReady(ingredient, 'Audio');
    return ingredient;
  }

  private assertIngredientReady(
    ingredient: IngredientDocument,
    label: 'Audio' | 'Image',
  ): void {
    if (
      String(ingredient.status) !== IngredientStatus.GENERATED &&
      String(ingredient.status) !== IngredientStatus.VALIDATED
    ) {
      throw new HttpException(
        {
          detail: `${label} must be in GENERATED or VALIDATED status`,
          title: `${label} not ready`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async dispatchLipSyncGeneration(
    user: User,
    dto: CreateLipSyncDto,
    imageIngredient: IngredientDocument,
    audioIngredient: IngredientDocument,
    ingredientId: string,
    metadataId: string,
    url: string,
  ): Promise<void> {
    const photoUrl = `${this.configService.ingredientsEndpoint}/images/${dto.parent}`;
    const audioUrl = `${this.configService.ingredientsEndpoint}/${categoryToPlural(audioIngredient.category)}/${dto.voice}`;
    this.loggerService.log(`${url} resolved URLs`, {
      audioCategory: audioIngredient.category,
      audioUrl,
      imageCategory: imageIngredient.category,
      photoUrl,
    });
    const heygenByokKey = await this.byokService.resolveApiKey(
      user.organizationId,
      ByokProvider.HEYGEN,
    );
    const heygenVideoId = await this.heygenService.generatePhotoAvatarVideo(
      ingredientId,
      photoUrl,
      audioUrl,
      user.organizationId,
      user.userId ?? user.id,
      heygenByokKey?.apiKey,
    );
    await this.metadataService.patch(
      metadataId,
      new MetadataEntity({ externalId: heygenVideoId }),
    );
    await this.websocketService.publishVideoProgress(
      WebSocketPaths.video(ingredientId),
      0,
      user.id,
      getUserRoomName(user.id),
    );
  }
}
