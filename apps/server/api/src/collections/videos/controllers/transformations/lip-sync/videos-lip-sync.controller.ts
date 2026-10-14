import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { GenerationBillingRequest } from '@api/collections/credits/services/generation-billing.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { CreateLipSyncDto } from '@api/collections/videos/dto/create-lip-sync.dto';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  ByokProvider,
  categoryToPlural,
  IngredientCategory,
  IngredientOrigin,
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
  Optional,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
@OrganizationModule('playground')
@UseGuards(CreditsGuard)
export class VideosLipSyncController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly avatarBilling: AvatarVideoBillingService,
    private readonly byokService: ByokService,
    private readonly configService: ConfigService,
    private readonly failedGenerationService: FailedGenerationService,
    private readonly heygenService: HeyGenService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly personasService: PersonasService,
    private readonly sharedService: SharedService,
    private readonly videosService: VideosService,
    private readonly websocketService: NotificationsPublisherService,
    @Optional()
    private readonly authorizedMediaUrls?: AuthorizedMediaUrlService,
  ) {}

  private async processingMediaUrl(
    organizationId: string,
    ingredientId: string,
    category: string,
  ): Promise<string> {
    if (!this.configService.isAuthorizedMediaDeliveryEnabled)
      return `${this.configService.ingredientsEndpoint}/${category}/${ingredientId}`;
    if (!this.authorizedMediaUrls)
      throw new Error('Authorized media issuer is unavailable');
    const urls = await this.authorizedMediaUrls.issueServerPublish(
      organizationId,
      [ingredientId],
    );
    const url = urls.get(ingredientId);
    if (!url) throw new Error('The source has no authorized media URL');
    return url;
  }

  @Post('lip-sync')
  // Priced on the per-second heygen/avatar row at the voice ingredient's
  // measured length. The hold carries the frozen quote; the HeyGen webhook
  // settles it to the duration HeyGen returns. No @Credits decorator: that
  // path would also deduct a flat credit on the response.
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createLipSyncVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createLipSyncDto: CreateLipSyncDto,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let ingredientId: string | undefined;
    let billing: GenerationBillingRequest | undefined;
    let providerAccepted = false;

    try {
      const imageIngredient = await this.resolveImageIngredient(
        createLipSyncDto.parent,
        user.organizationId,
      );
      // A character the active brand can no longer use is refused before any
      // output exists (#6040).
      const { personaId } =
        await this.personasService.resolveCharacterReferences({
          brandId: user.brandId ?? imageIngredient.brandId,
          ingredientIds: [createLipSyncDto.parent],
          organizationId: user.organizationId,
          path: 'lip-sync',
        });
      const audioIngredient = await this.resolveAudioIngredient(
        createLipSyncDto.voice,
        user.organizationId,
      );
      const heygenByokKey = await this.byokService.resolveApiKey(
        user.organizationId,
        ByokProvider.HEYGEN,
      );
      const funded = await this.avatarBilling.fundLipSync({
        audioIngredientId: String(audioIngredient.id),
        brandId: imageIngredient.brandId ?? user.brandId,
        organizationId: user.organizationId,
        useCustomerKey: Boolean(heygenByokKey?.apiKey),
        userId: user.userId ?? user.id,
      });
      billing = funded.request;
      const { metadataData, ingredientData } =
        await this.sharedService.createMediaDocuments(user, {
          origin: IngredientOrigin.GENERATED,
          brandId: imageIngredient.brandId ?? user.brandId,
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          model: MODEL_KEYS.HEYGEN_AVATAR,
          organizationId: user.organizationId,
          parentId: createLipSyncDto.parent,
          personaId,
          // Store references for traceability
          sourceIds: [createLipSyncDto.parent, createLipSyncDto.voice],
          status: IngredientStatus.PROCESSING,
        });

      ingredientId = String(ingredientData.id);
      if (billing) {
        await this.avatarBilling.bindRender(
          billing,
          funded.funding,
          ingredientId,
        );
      }
      const heygenVideoId = await this.dispatchLipSyncGeneration(
        user,
        imageIngredient,
        audioIngredient,
        ingredientId,
        url,
        heygenByokKey?.apiKey,
      );
      providerAccepted = true;
      await this.metadataService.patch(
        metadataData.id,
        new MetadataEntity({ externalId: heygenVideoId }),
      );
      await this.websocketService.publishVideoProgress(
        WebSocketPaths.video(ingredientId),
        0,
        user.id,
        getUserRoomName(user.id),
      );

      return serializeSingle(request, IngredientSerializer, ingredientData);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      // If ingredient was created but HeyGen did not accept the job, mark it
      // failed and return the output hold. An accepted job settles on the webhook.
      if (ingredientId && !providerAccepted) {
        const websocketUrl = WebSocketPaths.video(ingredientId);
        await this.failedGenerationService.handleFailedVideoGeneration(
          this.videosService,
          ingredientId,
          websocketUrl,
          user.id,
          getUserRoomName(user.id),
        );
        await this.avatarBilling.releaseGenerationHold(
          ingredientId,
          user.organizationId,
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
    } finally {
      if (billing) await this.avatarBilling.releasePool(billing);
    }
  }

  private async resolveImageIngredient(
    ingredientId: string,
    organizationId: string,
  ): Promise<IngredientDocument> {
    const ingredient = await this.ingredientsService.findOne({
      id: ingredientId,
      organizationId,
      isDeleted: false,
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
      isDeleted: false,
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
    imageIngredient: IngredientDocument,
    audioIngredient: IngredientDocument,
    ingredientId: string,
    url: string,
    heygenApiKey?: string,
  ): Promise<string> {
    const photoUrl = await this.processingMediaUrl(
      user.organizationId,
      String(imageIngredient.id),
      'images',
    );
    const audioUrl = await this.processingMediaUrl(
      user.organizationId,
      String(audioIngredient.id),
      categoryToPlural(audioIngredient.category),
    );
    this.loggerService.log(`${url} resolved URLs`, {
      audioCategory: audioIngredient.category,
      audioUrl,
      imageCategory: imageIngredient.category,
      photoUrl,
    });
    return this.heygenService.generatePhotoAvatarVideo(
      ingredientId,
      photoUrl,
      audioUrl,
      user.organizationId,
      user.userId ?? user.id,
      heygenApiKey,
    );
  }
}
