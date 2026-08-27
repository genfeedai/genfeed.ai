import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@server/collections/ingredients/schemas/ingredient.schema';
import type { GenerateVoiceDto } from '@server/collections/voices/dto/generate-voice.dto';
import { VoiceCreditsService } from '@server/collections/voices/services/voice-credits.service';
import { VoicesService } from '@server/collections/voices/services/voices.service';
import { AgentRunQueueService } from '@server/queues/agent-run/agent-run-queue.service';
import { SharedService } from '@server/shared/services/shared/shared.service';
import { PopulatePatterns } from '@server/shared/utils/populate/populate.util';
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
    private readonly agentRunQueueService: AgentRunQueueService,
  ) {}

  async generate(
    user: User,
    dto: GenerateVoiceDto,
    request: Request,
  ): Promise<IngredientDocument> {
    this.validateRequest(dto);

    if (dto.sourceActionId) {
      const accepted = await this.voicesService.findOne(
        {
          category: IngredientCategory.VOICE,
          isDeleted: false,
          organizationId: user.organizationId,
          sourceActionId: dto.sourceActionId,
          status: {
            in: [
              IngredientStatus.PROCESSING,
              IngredientStatus.GENERATED,
              IngredientStatus.VALIDATED,
            ],
          },
        },
        [PopulatePatterns.metadataFull],
      );
      if (accepted) {
        if (
          String(accepted.status).toUpperCase() === IngredientStatus.PROCESSING
        ) {
          await this.agentRunQueueService.queueVoiceGeneration({
            ingredientId: String(accepted.id),
            organizationId: user.organizationId,
            text: dto.text,
            userId: user.userId ?? user.id,
            voiceId: dto.voiceId,
          });
        }
        return accepted;
      }
    }

    await this.voiceCreditsService.assertOrganizationCanAfford(
      user.organizationId,
      1,
    );

    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        brandId: user.brandId,
        category: IngredientCategory.VOICE,
        extension: MetadataExtension.MP3,
        organizationId: user.organizationId,
        status: IngredientStatus.PROCESSING,
        sourceActionId: dto.sourceActionId,
        voiceSource: 'generated',
      },
    );
    const ingredientId = String(ingredientData.id);

    if (dto.waitForCompletion !== true) {
      await this.agentRunQueueService.queueVoiceGeneration({
        ingredientId,
        organizationId: user.organizationId,
        text: dto.text,
        userId: user.userId ?? user.id,
        voiceId: dto.voiceId,
      });
      const accepted = await this.voicesService.findOne(
        {
          id: ingredientId,
          isDeleted: false,
          organizationId: user.organizationId,
        },
        [PopulatePatterns.metadataFull],
      );
      if (!accepted) {
        throw new HttpException(
          {
            detail: `Ingredient ${ingredientId} not found after acceptance`,
            title: 'Generation error',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return accepted;
    }

    return this.executeGeneration({
      ingredientId,
      organizationId: user.organizationId,
      request,
      text: dto.text,
      userId: user.userId ?? user.id,
      voiceId: dto.voiceId,
    });
  }

  async executeQueuedGeneration(params: {
    ingredientId: string;
    organizationId: string;
    text: string;
    userId: string;
    voiceId: string;
  }): Promise<IngredientDocument> {
    const existing = await this.voicesService.findOne(
      {
        id: params.ingredientId,
        isDeleted: false,
        organizationId: params.organizationId,
      },
      [PopulatePatterns.metadataFull],
    );
    if (
      (existing?.cdnUrl || existing?.s3Key) &&
      ['GENERATED', 'VALIDATED'].includes(String(existing.status).toUpperCase())
    ) {
      await this.voiceCreditsService.settleBackgroundGenerationCredits({
        durationSeconds: Number(existing.duration) || 0,
        ingredientId: params.ingredientId,
        organizationId: params.organizationId,
        userId: params.userId,
      });
      return existing;
    }
    return this.executeGeneration(params);
  }

  private async executeGeneration(params: {
    ingredientId: string;
    organizationId: string;
    request?: Request;
    text: string;
    userId: string;
    voiceId: string;
  }): Promise<IngredientDocument> {
    let result: { audioUrl: string; duration: number };
    try {
      result = await this.elevenLabsService.generateAndUploadAudio(
        params.voiceId,
        params.text,
        params.ingredientId,
        params.organizationId,
        params.userId,
      );

      await this.voicesService.patchAll(
        {
          id: params.ingredientId,
          isDeleted: false,
          organizationId: params.organizationId,
        },
        {
          cdnUrl: result.audioUrl,
          duration: result.duration,
          status: IngredientStatus.GENERATED,
        },
      );
    } catch (error: unknown) {
      return await this.handleFailure(
        params.ingredientId,
        params.organizationId,
        error,
      );
    }

    try {
      if (params.request) {
        await this.voiceCreditsService.settleGenerationCredits(
          params.request,
          params.organizationId,
          result.duration,
        );
      } else {
        await this.voiceCreditsService.settleBackgroundGenerationCredits({
          durationSeconds: result.duration,
          ingredientId: params.ingredientId,
          organizationId: params.organizationId,
          userId: params.userId,
        });
      }

      const completedIngredient = await this.voicesService.findOne(
        {
          id: params.ingredientId,
          isDeleted: false,
          organizationId: params.organizationId,
        },
        [PopulatePatterns.metadataFull],
      );
      if (!completedIngredient) {
        throw new HttpException(
          {
            detail: `Ingredient ${params.ingredientId} not found after generation`,
            title: 'Generation error',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return completedIngredient;
    } catch (error: unknown) {
      if (!params.request) {
        throw error;
      }
      return await this.handleFailure(
        params.ingredientId,
        params.organizationId,
        error,
      );
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
    organizationId: string,
    error: unknown,
  ): Promise<never> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.error(`${url} voice generation failed`, error);
    await this.voicesService.patchAll(
      { id: ingredientId, isDeleted: false, organizationId },
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
