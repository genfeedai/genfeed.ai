import type { CloneVoiceDto } from '@api/collections/voices/dto/clone-voice.dto';
import {
  ByokProvider,
  IngredientCategory,
  IngredientStatus,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@server/collections/ingredients/schemas/ingredient.schema';
import { VoiceCreditsService } from '@server/collections/voices/services/voice-credits.service';
import { VoicesService } from '@server/collections/voices/services/voices.service';
import { CategoryPrismaUtil } from '@server/helpers/utils/category-prisma/category-prisma.util';
import { ByokService } from '@server/services/byok/byok.service';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import { ManagedInferenceRuntimeService } from '@server/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@server/shared/services/shared/shared.service';
import { PopulatePatterns } from '@server/shared/utils/populate/populate.util';
import type { Request } from 'express';

@Injectable()
export class VoiceCloneService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly byokService: ByokService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly managedInferenceRuntimeService: ManagedInferenceRuntimeService,
    private readonly loggerService: LoggerService,
    private readonly notificationsPublisherService: NotificationsPublisherService,
    private readonly sharedService: SharedService,
    private readonly voiceCreditsService: VoiceCreditsService,
    private readonly voicesService: VoicesService,
  ) {}

  async clone(
    user: User,
    dto: CloneVoiceDto,
    file: Express.Multer.File | undefined,
    request: Request,
  ): Promise<IngredientDocument> {
    this.validateInput(dto, file);
    const provider = dto.provider ?? VoiceProvider.ELEVENLABS;

    try {
      if (provider === VoiceProvider.ELEVENLABS) {
        await this.voiceCreditsService.settleElevenLabsCloneCredits(
          request,
          user.organizationId,
        );
        return await this.cloneWithElevenLabs(user, dto, file);
      }

      if (provider === VoiceProvider.GENFEED_AI) {
        return await this.cloneWithGenfeedAi(user, dto);
      }

      throw new HttpException(
        {
          detail: `Unsupported voice clone provider: ${provider}`,
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
      this.loggerService.error(`${url} voice cloning failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Voice cloning failed',
          title: 'Cloning failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteClonedVoice(
    user: User,
    id: string,
  ): Promise<IngredientDocument | null> {
    const voice = await this.voicesService.findOne(
      scopedWhere(user.organizationId, {
        id: id,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VOICE,
        ),
        isCloned: true,
      }),
    );
    if (!voice) {
      return null;
    }

    const voiceRecord = voice as unknown as {
      id: string;
      externalVoiceId?: string;
      voiceProvider?: VoiceProvider;
    };

    try {
      if (
        voiceRecord.externalVoiceId &&
        voiceRecord.voiceProvider === VoiceProvider.ELEVENLABS
      ) {
        const byokKey = await this.byokService.resolveApiKey(
          user.organizationId,
          ByokProvider.ELEVENLABS,
        );
        await this.elevenLabsService.deleteVoice(
          voiceRecord.externalVoiceId,
          byokKey?.apiKey,
        );
      }

      await this.voicesService.patchAll(
        { id: String(voiceRecord.id) },
        { isDeleted: true },
      );
      return voice;
    } catch (error: unknown) {
      const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
      this.loggerService.error(`${url} failed to delete cloned voice`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to delete cloned voice',
          title: 'Delete failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private validateInput(
    dto: CloneVoiceDto,
    file: Express.Multer.File | undefined,
  ): void {
    if (!file && !dto.audioUrl) {
      throw new HttpException(
        {
          detail: 'Either an audio file or audioUrl is required',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async cloneWithElevenLabs(
    user: User,
    dto: CloneVoiceDto,
    file: Express.Multer.File | undefined,
  ): Promise<IngredientDocument> {
    const byokKey = await this.byokService.resolveApiKey(
      user.organizationId,
      ByokProvider.ELEVENLABS,
    );
    const result = await this.elevenLabsService.cloneVoice(
      dto.name,
      file ? [file.buffer] : [],
      {
        description: dto.description,
        removeBackgroundNoise: dto.removeBackgroundNoise ?? true,
      },
      byokKey?.apiKey,
    );
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} ElevenLabs voice cloned`, {
      name: dto.name,
      voiceId: result.voiceId,
    });

    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        brandId: user.brandId,
        category: IngredientCategory.VOICE,
        label: dto.name,
        organizationId: user.organizationId,
        status: IngredientStatus.GENERATED,
      },
    );
    const ingredientId = String(ingredientData.id);

    await this.voicesService.patchAll(
      { id: ingredientId },
      {
        cloneStatus: VoiceCloneStatus.READY,
        externalVoiceId: result.voiceId,
        isCloned: true,
        isDefaultSelectable: true,
        isVoiceActive: true,
        voiceProvider: VoiceProvider.ELEVENLABS,
        voiceSource: 'cloned',
      },
    );

    const completedVoice = await this.findRequiredVoice(
      ingredientId,
      'Voice not found after cloning',
    );
    await this.notificationsPublisherService.publishAssetStatus(
      ingredientId,
      VoiceCloneStatus.READY,
      user.userId ?? user.id,
      {
        cloneStatus: VoiceCloneStatus.READY,
        provider: VoiceProvider.ELEVENLABS,
      },
    );

    return completedVoice;
  }

  private async cloneWithGenfeedAi(
    user: User,
    dto: CloneVoiceDto,
  ): Promise<IngredientDocument> {
    await this.assertGenfeedAiAvailable(dto);
    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        brandId: user.brandId,
        category: IngredientCategory.VOICE,
        label: dto.name,
        organizationId: user.organizationId,
        status: IngredientStatus.PROCESSING,
      },
    );
    const ingredientId = String(ingredientData.id);

    await this.markGenfeedAiCloneStarted(ingredientId, dto, user);
    const result = await this.managedInferenceRuntimeService.cloneVoice({
      audioUrl: dto.audioUrl as string,
      handle: ingredientId,
      label: dto.name,
    });
    if (!result) {
      return await this.markGenfeedAiCloneFailed(ingredientId, user);
    }

    await this.voicesService.patchAll(
      {
        id: ingredientId,
        organizationId: user.organizationId,
      },
      {
        providerData: {
          fleet: { jobId: result.jobId, jobKind: 'voice-clone' },
        },
      },
    );

    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} Genfeed AI voice clone initiated`, {
      jobId: result.jobId,
      name: dto.name,
    });
    return this.findRequiredVoice(
      ingredientId,
      'Voice not found after clone initiation',
    );
  }

  private async assertGenfeedAiAvailable(dto: CloneVoiceDto): Promise<void> {
    const isAvailable =
      await this.managedInferenceRuntimeService.isAvailable('voices');
    if (!isAvailable) {
      throw new HttpException(
        {
          detail:
            'Self-hosted voice service is currently offline. Try ElevenLabs instead.',
          title: 'Service unavailable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!dto.audioUrl) {
      throw new HttpException(
        {
          detail: 'audioUrl is required for Genfeed AI voice cloning',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async markGenfeedAiCloneStarted(
    ingredientId: string,
    dto: CloneVoiceDto,
    user: User,
  ): Promise<void> {
    await this.voicesService.patchAll(
      {
        id: ingredientId,
        organizationId: user.organizationId,
      },
      {
        cloneStatus: VoiceCloneStatus.CLONING,
        isCloned: true,
        isDefaultSelectable: true,
        isVoiceActive: true,
        sampleAudioUrl: dto.audioUrl,
        voiceProvider: VoiceProvider.GENFEED_AI,
        voiceSource: 'cloned',
      },
    );
    await this.notificationsPublisherService.publishAssetStatus(
      ingredientId,
      VoiceCloneStatus.CLONING,
      user.userId ?? user.id,
      {
        cloneStatus: VoiceCloneStatus.CLONING,
        progress: 10,
        provider: VoiceProvider.GENFEED_AI,
      },
    );
  }

  private async markGenfeedAiCloneFailed(
    ingredientId: string,
    user: User,
  ): Promise<never> {
    await this.voicesService.patchAll(
      {
        id: ingredientId,
        organizationId: user.organizationId,
      },
      {
        cloneStatus: VoiceCloneStatus.FAILED,
        status: IngredientStatus.FAILED,
      },
    );
    await this.notificationsPublisherService.publishAssetStatus(
      ingredientId,
      VoiceCloneStatus.FAILED,
      user.userId ?? user.id,
      {
        cloneStatus: VoiceCloneStatus.FAILED,
        provider: VoiceProvider.GENFEED_AI,
      },
    );
    throw new HttpException(
      {
        detail: 'Voice cloning request failed. The service may be unavailable.',
        title: 'Clone failed',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  private async findRequiredVoice(
    ingredientId: string,
    detail: string,
  ): Promise<IngredientDocument> {
    const voice = await this.voicesService.findOne({ id: ingredientId }, [
      PopulatePatterns.metadataFull,
    ]);
    if (!voice) {
      throw new HttpException(
        { detail, title: 'Clone error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return voice;
  }
}
