import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ActivitySource } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
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
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { CreateAvatarVideoDto } from '@server/collections/videos/dto/create-avatar-video.dto';
import { AvatarVideoGenerationService } from '@server/collections/videos/services/avatar-video-generation.service';
import { VideosService } from '@server/collections/videos/services/videos.service';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import type { Request } from 'express';

@AutoSwagger()
@Controller('videos')
@UseGuards(SubscriptionGuard, CreditsGuard)
@UseInterceptors(CreditsInterceptor)
export class AvatarVideoController {
  constructor(
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    private readonly videosService: VideosService,
  ) {}

  @Post('avatar')
  @Credits({
    description: 'Avatar video generation',
    modelKey: MODEL_KEYS.HEYGEN_AVATAR,
    source: ActivitySource.VIDEO_GENERATION,
  })
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
            clonedVoiceId: createAvatarVideoDto.clonedVoiceId,
            elevenlabsVoiceId: createAvatarVideoDto.elevenlabsVoiceId,
            heygenVoiceId: createAvatarVideoDto.heygenVoiceId,
            photoUrl: createAvatarVideoDto.photoUrl,
            text: createAvatarVideoDto.text ?? '',
            useIdentity: createAvatarVideoDto.useIdentity,
            voiceProvider: createAvatarVideoDto.voiceProvider,
          },
          {
            brandId: user.brandId,
            organizationId: user.organizationId,
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
