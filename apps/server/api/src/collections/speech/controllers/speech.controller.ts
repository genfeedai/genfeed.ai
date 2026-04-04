/**
 * Speech Controller
 * Handles speech-to-text transcription using Replicate Whisper API
 * Deducts 1 credit per transcription from organization
 */

import { TranscribeAudioDto } from '@api/collections/speech/dto/transcribe-audio.dto';
import { TranscribeUrlDto } from '@api/collections/speech/dto/transcribe-url.dto';
import { ValidationConfigService } from '@api/config/services/validation.config';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { User } from '@clerk/backend';
import { SpeechTranscriptionSerializer } from '@genfeedai/serializers';
import { FileInputType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

/**
 * SpeechController
 * Handles speech-to-text transcription with credit deduction
 */
@AutoSwagger()
@Controller('speech')
export class SpeechController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly replicateService: ReplicateService,
    private readonly validationConfigService: ValidationConfigService,
  ) {}

  @Post('transcribe/audio')
  @Credits({ amount: 1, description: 'Speech transcription from audio file' })
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(
    CreditsInterceptor,
    FileInterceptor('audio', {
      limits: {
        fileSize: 25 * 1024 * 1024, // 25MB max file size (Whisper limit)
      },
    }),
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async transcribeAudio(
    @Req() req: Request,
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body() transcribeDto: TranscribeAudioDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const language = transcribeDto.language;
    const prompt = transcribeDto.prompt;

    // Validate the uploaded audio file
    const allowedMimeTypes =
      this.validationConfigService.getAllowedAudioMimeTypes();
    const allowedExtensions =
      this.validationConfigService.getAllowedAudioExtensions();

    const validatedFile = InputValidationUtil.validateFileUpload(
      file,
      'audio',
      {
        allowedExtensions,
        allowedMimeTypes,
        required: true,
        validationConfig: this.validationConfigService,
      },
    );

    if (!validatedFile) {
      throw new HttpException(
        {
          detail: 'Valid audio file is required',
          title: 'Audio file validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Call Replicate Whisper API for file transcription
      const transcription = await this.replicateService.transcribeAudio({
        audio: {
          data: validatedFile.buffer,
          filename: validatedFile.originalname,
          type: FileInputType.BUFFER,
        },
        language: language || 'auto',
        prompt: prompt || undefined,
      });

      this.loggerService.log(`${url} completed`, {
        creditsUsed: 1,
        duration: transcription.duration,
        language: transcription.language,
        organizationId: publicMetadata.organization,
        textLength: transcription.text.length,
        userId: user.id,
      });

      const result = {
        confidence: transcription.confidence,
        creditsUsed: 1,
        duration: transcription.duration,
        language: transcription.language,
        text: transcription.text,
      };

      return serializeSingle(req, SpeechTranscriptionSerializer, result);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error as Error);

      throw new HttpException(
        {
          detail:
            (error as Error)?.message || 'Failed to transcribe audio file',
          title: 'Transcription failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('transcribe/url')
  @Credits({ amount: 1, description: 'Speech transcription from URL' })
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async transcribeUrl(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() transcribeUrlDto: TranscribeUrlDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    const audioUrl = transcribeUrlDto.url;
    const language = transcribeUrlDto.language;
    const prompt = transcribeUrlDto.prompt;

    if (!audioUrl) {
      throw new HttpException(
        {
          detail: 'Valid audio URL is required',
          title: 'Audio URL required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Call Replicate Whisper API with URL
      const transcription = await this.replicateService.transcribeAudio({
        audio: {
          type: FileInputType.URL,
          url: audioUrl,
        },
        language: language || 'auto',
        prompt: prompt || undefined,
      });

      this.loggerService.log(`${url} completed`, {
        creditsUsed: 1,
        duration: transcription.duration,
        language: transcription.language,
        organizationId: publicMetadata.organization,
        textLength: transcription.text.length,
        userId: user.id,
      });

      const result = {
        confidence: transcription.confidence,
        creditsUsed: 1,
        duration: transcription.duration,
        language: transcription.language,
        text: transcription.text,
      };

      return serializeSingle(req, SpeechTranscriptionSerializer, result);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error as Error);

      throw new HttpException(
        {
          detail:
            (error as Error)?.message || 'Failed to transcribe audio from URL',
          title: 'Transcription failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
