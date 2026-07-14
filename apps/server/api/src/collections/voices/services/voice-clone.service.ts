import type {
  IAuthPublicMetadata,
  AuthenticatedUser as User,
} from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { CloneVoiceDto } from '@api/collections/voices/dto/clone-voice.dto';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { ByokService } from '@api/services/byok/byok.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ByokProvider,
  IngredientCategory,
  IngredientStatus,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import type { Request } from 'express';

@Injectable()
export class VoiceCloneService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly byokService: ByokService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly fleetService: FleetService,
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
    const publicMetadata = getPublicMetadata(user);
    const provider = dto.provider ?? VoiceProvider.ELEVENLABS;

    try {
      if (provider === VoiceProvider.ELEVENLABS) {
        await this.voiceCreditsService.settleElevenLabsCloneCredits(
          request,
          publicMetadata.organization,
        );
        return await this.cloneWithElevenLabs(user, dto, file, publicMetadata);
      }

      if (provider === VoiceProvider.GENFEED_AI) {
        return await this.cloneWithGenfeedAi(user, dto, publicMetadata);
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
    const publicMetadata = getPublicMetadata(user);
    const voice = await this.voicesService.findOne({
      _id: id,
      isCloned: true,
      isDeleted: false,
      organizationId: publicMetadata.organization,
    });
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
          publicMetadata.organization,
          ByokProvider.ELEVENLABS,
        );
        await this.elevenLabsService.deleteVoice(
          voiceRecord.externalVoiceId,
          byokKey?.apiKey,
        );
      }

      await this.voicesService.patchAll(
        {
          OR: [
            { id: String(voiceRecord.id) },
            { mongoId: String(voiceRecord.id) },
          ],
        },
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
    publicMetadata: IAuthPublicMetadata,
  ): Promise<IngredientDocument> {
    const byokKey = await this.byokService.resolveApiKey(
      publicMetadata.organization,
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

    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      brand: publicMetadata.brand,
      category: IngredientCategory.VOICE,
      label: dto.name,
      organization: publicMetadata.organization,
      status: IngredientStatus.GENERATED,
    });
    const ingredientId = String(ingredientData.id);

    await this.voicesService.patchAll(
      { OR: [{ id: ingredientId }, { mongoId: ingredientId }] },
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
      publicMetadata.user,
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
    publicMetadata: IAuthPublicMetadata,
  ): Promise<IngredientDocument> {
    await this.assertGenfeedAiAvailable(dto);
    const { ingredientData } = await this.sharedService.saveDocuments(user, {
      brand: publicMetadata.brand,
      category: IngredientCategory.VOICE,
      label: dto.name,
      organization: publicMetadata.organization,
      status: IngredientStatus.PROCESSING,
    });
    const ingredientId = String(ingredientData.id);

    await this.markGenfeedAiCloneStarted(ingredientId, dto, publicMetadata);
    const result = await this.fleetService.cloneVoice({
      audioUrl: dto.audioUrl as string,
      handle: ingredientId,
      label: dto.name,
    });
    if (!result) {
      await this.markGenfeedAiCloneFailed(ingredientId, publicMetadata);
    }

    await this.voicesService.patchAll(
      {
        OR: [{ id: ingredientId }, { mongoId: ingredientId }],
        organizationId: publicMetadata.organization,
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
    const isAvailable = await this.fleetService.isAvailable('voices');
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
    publicMetadata: IAuthPublicMetadata,
  ): Promise<void> {
    await this.voicesService.patchAll(
      {
        OR: [{ id: ingredientId }, { mongoId: ingredientId }],
        organizationId: publicMetadata.organization,
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
      publicMetadata.user,
      {
        cloneStatus: VoiceCloneStatus.CLONING,
        progress: 10,
        provider: VoiceProvider.GENFEED_AI,
      },
    );
  }

  private async markGenfeedAiCloneFailed(
    ingredientId: string,
    publicMetadata: IAuthPublicMetadata,
  ): Promise<never> {
    await this.voicesService.patchAll(
      {
        OR: [{ id: ingredientId }, { mongoId: ingredientId }],
        organizationId: publicMetadata.organization,
      },
      {
        cloneStatus: VoiceCloneStatus.FAILED,
        status: IngredientStatus.FAILED,
      },
    );
    await this.notificationsPublisherService.publishAssetStatus(
      ingredientId,
      VoiceCloneStatus.FAILED,
      publicMetadata.user,
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
    const voice = await this.voicesService.findOne({ _id: ingredientId }, [
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
