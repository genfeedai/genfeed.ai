import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CreateLipSyncDto } from '@api/collections/videos/dto/create-lip-sync.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { ConfigService } from '@api/config/config.service';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  ActivitySource,
  ByokProvider,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
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
  // manual inline deductCreditsFromOrganization call, which double-tracked the
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
      const publicMetadata = getPublicMetadata(user);

      // 1. Resolve parent (image) ingredient
      const imageIngredient = await this.ingredientsService.findOne({
        _id: createLipSyncDto.parent,
        isDeleted: false,
        organization: publicMetadata.organization,
      });

      if (!imageIngredient) {
        throw new HttpException(
          {
            detail: `Image ingredient with ID ${createLipSyncDto.parent} not found`,
            title: 'Image not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Validate image category
      if (String(imageIngredient.category) !== IngredientCategory.IMAGE) {
        throw new HttpException(
          {
            detail: `Expected image ingredient, got ${imageIngredient.category}`,
            title: 'Invalid ingredient type',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate image is in a usable state
      if (
        String(imageIngredient.status) !== IngredientStatus.GENERATED &&
        String(imageIngredient.status) !== IngredientStatus.VALIDATED
      ) {
        throw new HttpException(
          {
            detail: 'Image must be in GENERATED or VALIDATED status',
            title: 'Image not ready',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 2. Resolve voice (audio) ingredient
      const audioIngredient = await this.ingredientsService.findOne({
        _id: createLipSyncDto.voice,
        isDeleted: false,
        organization: publicMetadata.organization,
      });

      if (!audioIngredient) {
        throw new HttpException(
          {
            detail: `Audio ingredient with ID ${createLipSyncDto.voice} not found`,
            title: 'Audio not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Validate audio category (could be AUDIO or VIDEO with audio)
      if (
        String(audioIngredient.category) !== IngredientCategory.AUDIO &&
        String(audioIngredient.category) !== IngredientCategory.VIDEO
      ) {
        throw new HttpException(
          {
            detail: `Expected audio or video ingredient, got ${audioIngredient.category}`,
            title: 'Invalid ingredient type',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate audio is in a usable state
      if (
        String(audioIngredient.status) !== IngredientStatus.GENERATED &&
        String(audioIngredient.status) !== IngredientStatus.VALIDATED
      ) {
        throw new HttpException(
          {
            detail: 'Audio must be in GENERATED or VALIDATED status',
            title: 'Audio not ready',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 3. Build CDN URLs
      const photoUrl = `${this.configService.ingredientsEndpoint}/images/${createLipSyncDto.parent}`;
      const audioUrl = `${this.configService.ingredientsEndpoint}/${audioIngredient.category}s/${createLipSyncDto.voice}`;

      this.loggerService.log(`${url} resolved URLs`, {
        audioCategory: audioIngredient.category,
        audioUrl,
        imageCategory: imageIngredient.category,
        photoUrl,
      });

      // 4. Create video ingredient with metadata
      const { metadataData, ingredientData } =
        await this.sharedService.saveDocuments(user, {
          brand: imageIngredient.brand || publicMetadata.brand,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          model: MODEL_KEYS.HEYGEN_AVATAR,
          organization: publicMetadata.organization,
          parent: createLipSyncDto.parent,
          // Store references for traceability
          references: [createLipSyncDto.parent, createLipSyncDto.voice],
          status: IngredientStatus.PROCESSING,
        });

      ingredientId = String(ingredientData.id);

      // 5. Call HeyGen Photo Avatar API
      this.loggerService.log(`${url} calling HeyGen Photo Avatar API`, {
        audioUrl,
        ingredientId,
        photoUrl,
      });

      const heygenByokKey = await this.byokService.resolveApiKey(
        publicMetadata.organization,
        ByokProvider.HEYGEN,
      );
      const heygenVideoId = await this.heygenService.generatePhotoAvatarVideo(
        ingredientId,
        photoUrl,
        audioUrl,
        publicMetadata.organization,
        publicMetadata.user,
        heygenByokKey?.apiKey,
      );

      // 6. Update metadata with external ID
      await this.metadataService.patch(
        metadataData.id,
        new MetadataEntity({
          externalId: heygenVideoId,
        }),
      );

      // 7. Publish initial WebSocket status
      // Credits (1) are deducted by CreditsInterceptor on successful response —
      // see the @Credits decorator above. No manual deduction here.
      const websocketUrl = WebSocketPaths.video(ingredientId);
      // @ts-expect-error TS2554
      await this.websocketService.publishFileProcessing(
        websocketUrl,
        {
          eventType: WebSocketEventType.VIDEO_GENERATED,
          id: ingredientId,
          status: WebSocketEventStatus.PROCESSING,
        },
        user.id,
        getUserRoomName(user.id),
      );

      // 8. Return serialized ingredient for frontend subscription
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
}
