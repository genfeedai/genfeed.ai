import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateAvatarVideoDto } from '@api/collections/videos/dto/create-avatar-video.dto';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { type CreditsGuardRequest } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
@UseGuards(SubscriptionGuard)
export class AvatarVideoController {
  constructor(
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    private readonly videosService: VideosService,
  ) {}

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
          {
            aspectRatio: createAvatarVideoDto.aspectRatio,
            audioUrl: createAvatarVideoDto.audioUrl,
            avatarId: createAvatarVideoDto.avatarId,
            avatarRef: createAvatarVideoDto.avatarRef,
            voiceRef: createAvatarVideoDto.voiceRef,
            audioIngredientId: createAvatarVideoDto.audioIngredientId,
            clonedVoiceId: createAvatarVideoDto.clonedVoiceId,
            elevenlabsVoiceId: createAvatarVideoDto.elevenlabsVoiceId,
            heygenVoiceId: createAvatarVideoDto.heygenVoiceId,
            photoUrl: createAvatarVideoDto.photoUrl,
            photoIngredientId: createAvatarVideoDto.photoIngredientId,
            text: createAvatarVideoDto.text ?? '',
            useIdentity: createAvatarVideoDto.useIdentity,
            voiceProvider: createAvatarVideoDto.voiceProvider,
          },
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
