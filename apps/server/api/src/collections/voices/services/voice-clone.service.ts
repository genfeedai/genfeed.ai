import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { CloneVoiceDto } from '@api/collections/voices/dto/clone-voice.dto';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import {
  readSavedVoiceBinding,
  savedVoiceProviderData,
} from '@api/collections/voices/utils/elevenlabs-voice-binding.schema';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { scopedWhere } from '@api/index';
import {
  classifyElevenLabsFailure,
  toElevenLabsActionableError,
} from '@api/services/integrations/elevenlabs/elevenlabs-error.util';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class VoiceCloneService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly connectionService: ElevenLabsConnectionService,
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
      providerData?: unknown;
      voiceProvider?: VoiceProvider;
    };

    if (
      voiceRecord.externalVoiceId &&
      voiceRecord.voiceProvider === VoiceProvider.ELEVENLABS
    ) {
      await this.deleteRemoteElevenLabsVoice(
        user.organizationId,
        voiceRecord.externalVoiceId,
        voiceRecord.providerData,
      );
    }

    try {
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

  /**
   * Deletes the remote clone through the account that created it. A clone
   * bound to the personal connection fails explicitly when that connection is
   * gone rather than reaching the platform account.
   */
  private async deleteRemoteElevenLabsVoice(
    organizationId: string,
    externalVoiceId: string,
    providerData: unknown,
  ): Promise<void> {
    const binding = readSavedVoiceBinding(providerData);
    const connection = binding
      ? await this.connectionService.resolve(
          organizationId,
          binding.connection.kind,
        )
      : ((await this.connectionService.findPersonalConnection(
          organizationId,
        )) ??
        (await this.connectionService.resolve(organizationId, 'platform')));

    try {
      await this.elevenLabsService.deleteVoice(
        externalVoiceId,
        connection.apiKey,
      );
    } catch (error: unknown) {
      // Already removed in ElevenLabs: only the local reference remains.
      if (classifyElevenLabsFailure(error) === 'voice-unavailable') {
        return;
      }
      throw toElevenLabsActionableError(error);
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
    const connection =
      (await this.connectionService.findPersonalConnection(
        user.organizationId,
      )) ??
      (await this.connectionService.resolve(user.organizationId, 'platform'));
    let result: { voiceId: string; name: string };
    try {
      result = await this.elevenLabsService.cloneVoice(
        dto.name,
        file ? [file.buffer] : [],
        {
          description: dto.description,
          removeBackgroundNoise: dto.removeBackgroundNoise ?? true,
        },
        connection.apiKey,
      );
    } catch (error: unknown) {
      throw toElevenLabsActionableError(error);
    }
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} ElevenLabs voice cloned`, {
      name: dto.name,
      voiceId: result.voiceId,
    });

    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        origin: IngredientOrigin.GENERATED,
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
        providerData: savedVoiceProviderData(
          undefined,
          connection.binding,
          'cloned',
        ),
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
        origin: IngredientOrigin.GENERATED,
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
