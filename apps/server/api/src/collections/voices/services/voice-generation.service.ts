import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import type { Request } from 'express';

@Injectable()
export class VoiceGenerationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly elevenLabsService: ElevenLabsService,
    private readonly loggerService: LoggerService,
    private readonly sharedService: SharedService,
    private readonly voiceCreditsService: VoiceCreditsService,
    private readonly voicesService: VoicesService,
  ) {}

  async generate(
    user: User,
    dto: GenerateVoiceDto,
    request: Request,
  ): Promise<IngredientDocument> {
    this.validateRequest(dto);

    const publicMetadata = getPublicMetadata(user);
    await this.voiceCreditsService.assertOrganizationCanAfford(
      publicMetadata.organization,
      1,
    );

    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      brand: publicMetadata.brand,
      category: IngredientCategory.VOICE,
      extension: MetadataExtension.MP3,
      organization: publicMetadata.organization,
      status: IngredientStatus.PROCESSING,
      voiceSource: 'generated',
    });
    const ingredientId = String(ingredientData.id);

    try {
      const result = await this.elevenLabsService.generateAndUploadAudio(
        dto.voiceId,
        dto.text,
        ingredientId,
        publicMetadata.organization,
        publicMetadata.user,
      );

      await this.voicesService.patchAll(
        { OR: [{ id: ingredientId }, { mongoId: ingredientId }] },
        {
          duration: result.duration,
          status: IngredientStatus.GENERATED,
          url: result.audioUrl,
        },
      );
      await this.voiceCreditsService.settleGenerationCredits(
        request,
        publicMetadata.organization,
        result.duration,
      );

      const completedIngredient = await this.voicesService.findOne(
        { _id: ingredientId },
        [PopulatePatterns.metadataFull],
      );
      if (!completedIngredient) {
        throw new HttpException(
          {
            detail: `Ingredient ${ingredientId} not found after generation`,
            title: 'Generation error',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return completedIngredient;
    } catch (error: unknown) {
      return await this.handleFailure(ingredientId, error);
    }
  }

  private validateRequest(dto: GenerateVoiceDto): void {
    if (!dto.text) {
      throw new HttpException(
        { detail: 'Text is required', title: 'Validation failed' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.voiceId) {
      throw new HttpException(
        { detail: 'voiceId is required', title: 'Validation failed' },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async handleFailure(
    ingredientId: string,
    error: unknown,
  ): Promise<never> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.error(`${url} voice generation failed`, error);
    await this.voicesService.patchAll(
      { OR: [{ id: ingredientId }, { mongoId: ingredientId }] },
      { status: IngredientStatus.FAILED },
    );

    if (error instanceof HttpException) {
      throw error;
    }

    throw new HttpException(
      {
        detail: (error as Error)?.message || 'Voice generation failed',
        title: 'Generation failed',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
