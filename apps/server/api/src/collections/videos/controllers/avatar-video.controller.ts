import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateAvatarVideoDto } from '@api/collections/videos/dto/create-avatar-video.dto';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import type { AvatarVideoGenerationParams } from '@api/collections/videos/services/avatar-video-generation.types';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { type CreditsGuardRequest } from '@api/helpers/guards/credits/credits.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import {
  AvatarGenerationQuoteSerializer,
  IngredientSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

/** Generation and its quote read the same body the same way. */
function toAvatarVideoGenerationParams(
  dto: CreateAvatarVideoDto,
): AvatarVideoGenerationParams {
  return {
    aspectRatio: dto.aspectRatio,
    audioUrl: dto.audioUrl,
    autoSelectModel: dto.autoSelectModel,
    avatarId: dto.avatarId,
    avatarRef: dto.avatarRef,
    voiceRef: dto.voiceRef,
    audioIngredientId: dto.audioIngredientId,
    clonedVoiceId: dto.clonedVoiceId,
    elevenlabsVoiceId: dto.elevenlabsVoiceId,
    heygenVoiceId: dto.heygenVoiceId,
    model: dto.model,
    photoUrl: dto.photoUrl,
    photoIngredientId: dto.photoIngredientId,
    prioritize: dto.prioritize,
    text: dto.text ?? '',
    useIdentity: dto.useIdentity,
    voiceProvider: dto.voiceProvider,
  };
}

@AutoSwagger()
@Controller('videos')
@OrganizationModule('playground')
export class AvatarVideoController {
  constructor(
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    private readonly videosService: VideosService,
  ) {}

  /**
   * The credits `POST /videos/avatar` would hold for the same body, through
   * the same identity admission and funding. Read-only: no hold, placeholder
   * or provider render. BYOK renders quote 0 platform credits.
   */
  @Post('avatar/quote')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 60, scope: 'organization', windowMs: 60_000 })
  @LogMethod({ logEnd: false, logError: true, logStart: false })
  async quoteAvatarVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() quoteAvatarVideoDto: CreateAvatarVideoDto,
  ): Promise<JsonApiSingleResponse> {
    const quote = await this.avatarVideoGenerationService.quote(
      toAvatarVideoGenerationParams(quoteAvatarVideoDto),
      {
        brandId: user.brandId,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      },
    );
    return serializeSingle(request, AvatarGenerationQuoteSerializer, {
      id: randomUUID(),
      ...quote,
    });
  }

  @Post('avatar')
  // Admission and funding are owned by AvatarVideoGenerationService, so
  // identity/readiness failures happen before a credit hold is opened.
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createAvatarVideo(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createAvatarVideoDto: CreateAvatarVideoDto,
  ): Promise<JsonApiSingleResponse> {
    try {
      const result =
        await this.avatarVideoGenerationService.generateAvatarVideo(
          toAvatarVideoGenerationParams(createAvatarVideoDto),
          {
            brandId: user.brandId,
            organizationId: user.organizationId,
            request: request as CreditsGuardRequest,
            userId: user.userId ?? user.id,
          },
        );

      const ingredient = await this.videosService.findOne({
        id: result.ingredientId,
        organizationId: user.organizationId,
      });

      if (!ingredient) {
        throw new HttpException(
          {
            detail: `Video ingredient ${result.ingredientId} not found after avatar generation`,
            title: 'Avatar video generation failed',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return serializeSingle(request, IngredientSerializer, ingredient);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail:
            error instanceof Error
              ? error.message
              : 'An error occurred while generating avatar video',
          title: 'Avatar video generation failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
