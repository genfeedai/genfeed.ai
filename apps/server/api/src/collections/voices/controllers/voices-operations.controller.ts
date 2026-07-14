import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CloneVoiceDto } from '@api/collections/voices/dto/clone-voice.dto';
import { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ActivitySource } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { VoiceCloneSerializer, VoiceSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

@AutoSwagger()
@Controller('voices')
export class VoicesOperationsController {
  constructor(
    private readonly voiceCloneService: VoiceCloneService,
    private readonly voiceGenerationService: VoiceGenerationService,
  ) {}

  @Post('generate')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @Credits({
    description: 'Voice generation (TTS)',
    source: ActivitySource.VOICE_GENERATION,
  })
  @DeferCreditsUntilModelResolution()
  @RateLimit({ limit: 30, windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: GenerateVoiceDto,
  ): Promise<JsonApiSingleResponse> {
    const voice = await this.voiceGenerationService.generate(
      user,
      dto,
      request,
    );
    return serializeSingle(request, VoiceSerializer, voice);
  }

  @Post('clone')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(
    CreditsInterceptor,
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  @DeferCreditsUntilModelResolution()
  @Credits({
    description: 'Voice cloning',
    source: ActivitySource.VOICE_GENERATION,
  })
  @RateLimit({ limit: 10, windowMs: 60 * 1000 })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async cloneVoice(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CloneVoiceDto,
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'webm'],
        allowedMimeTypes: [
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/aac',
          'audio/flac',
          'audio/ogg',
          'audio/webm',
        ],
        maxSizeBytes: 25 * 1024 * 1024,
        required: false,
      }),
    )
    file?: Express.Multer.File,
  ): Promise<JsonApiSingleResponse> {
    const voice = await this.voiceCloneService.clone(user, dto, file, request);
    return serializeSingle(request, VoiceCloneSerializer, voice);
  }
}
