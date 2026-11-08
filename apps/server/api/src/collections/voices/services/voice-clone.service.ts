import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { CloneVoiceDto } from '@api/collections/voices/dto/clone-voice.dto';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import {
  readSavedVoiceBinding,
  savedVoiceProviderData,
} from '@api/collections/voices/utils/elevenlabs-voice-binding.schema';
import { scopedWhere } from '@api/index';
import {
  classifyElevenLabsFailure,
  toElevenLabsActionableError,
} from '@api/services/integrations/elevenlabs/elevenlabs-error.util';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import {
  describeVoiceCloneFailure,
  type HeyGenClonedVoice,
} from '@api/services/integrations/heygen/helpers/heygen-twin';
import { HeyGenTwinService } from '@api/services/integrations/heygen/services/heygen-twin.service';
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
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/** An instant clone is usually ready within seconds. */
export const HEYGEN_CLONE_POLL_INTERVAL_MS = 2_000;
/** Stay well inside the HTTP request timeout. */
export const HEYGEN_CLONE_WAIT_MS = 40_000;

@Traced()
@Injectable()
export class VoiceCloneService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly connectionService: ElevenLabsConnectionService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly heyGenTwinService: HeyGenTwinService,
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
        return await this.cloneWithElevenLabs(user, dto, file, request);
      }

      if (provider === VoiceProvider.HEYGEN) {
        return await this.cloneWithHeyGen(user, dto, file, request);
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
        category: IngredientCategory.VOICE,
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

    if (
      voiceRecord.externalVoiceId &&
      voiceRecord.voiceProvider === VoiceProvider.HEYGEN
    ) {
      await this.heyGenTwinService.deleteVoice(
        user.organizationId,
        voiceRecord.externalVoiceId,
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
    request: Request,
  ): Promise<IngredientDocument> {
    // A cloned voice is the person's own: it is created only in their own
    // ElevenLabs account, never in the platform account, and the platform
    // charges nothing for it.
    const connection = await this.connectionService.findPersonalConnection(
      user.organizationId,
    );
    if (!connection) {
      throw new HttpException(
        {
          detail:
            'Connect your ElevenLabs account in Settings → Integrations to clone your voice. The voice is created in your own account.',
          title: 'ElevenLabs account required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    this.voiceCreditsService.waivePersonalCloneCredits(request);
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

  /**
   * An instant clone in the person's own HeyGen account, from a WAV or MP3
   * sample. Like ElevenLabs, there is no platform fallback and no platform
   * charge. The voice is saved only once HeyGen reports it active.
   */
  private async cloneWithHeyGen(
    user: User,
    dto: CloneVoiceDto,
    file: Express.Multer.File | undefined,
    request: Request,
  ): Promise<IngredientDocument> {
    if (!file) {
      throw new HttpException(
        {
          detail: 'Record or upload a WAV or MP3 voice sample.',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    let created: Awaited<ReturnType<HeyGenTwinService['cloneVoice']>>;
    try {
      created = await this.heyGenTwinService.cloneVoice(user.organizationId, {
        audio: file.buffer,
        contentType: file.mimetype,
        name: dto.name,
        removeBackgroundNoise: dto.removeBackgroundNoise ?? true,
      });
    } catch (error: unknown) {
      throw toHttpException(error);
    }
    this.voiceCreditsService.waivePersonalCloneCredits(request);

    // From here on the voice exists in the person's HeyGen account: any
    // failure before it is saved here removes it again, so a retry never
    // leaves an untracked clone behind under a name they cannot see.
    let ingredientId: string;
    try {
      ingredientId = await this.saveHeyGenVoice(user, dto, created);
    } catch (error: unknown) {
      await this.heyGenTwinService
        .deleteVoice(user.organizationId, created.voiceId)
        .catch((cleanupError: unknown) => {
          this.loggerService.error(
            `${this.constructorName} could not remove unfinished HeyGen voice ${created.voiceId}`,
            cleanupError,
          );
        });
      throw error;
    }

    const completedVoice = await this.findRequiredVoice(
      ingredientId,
      'Voice not found after cloning',
    );
    // The voice is saved; a missed live update must not report it as failed.
    try {
      await this.notificationsPublisherService.publishAssetStatus(
        ingredientId,
        VoiceCloneStatus.READY,
        user.userId ?? user.id,
        { cloneStatus: VoiceCloneStatus.READY, provider: VoiceProvider.HEYGEN },
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} could not publish the cloned voice status`,
        error,
      );
    }
    return completedVoice;
  }

  /** Waits for HeyGen to finish the clone, then saves it as a voice here. */
  private async saveHeyGenVoice(
    user: User,
    dto: CloneVoiceDto,
    created: Awaited<ReturnType<HeyGenTwinService['cloneVoice']>>,
  ): Promise<string> {
    const voice = await this.waitForHeyGenVoice(
      user.organizationId,
      created.voiceId,
    );
    if (voice.status !== 'active') {
      throw new HttpException(
        {
          detail:
            voice.status === 'failed'
              ? describeVoiceCloneFailure(voice.failureReason)
              : 'HeyGen is taking longer than usual to create the voice. Try again in a few minutes.',
          title: 'Cloning failed',
        },
        voice.status === 'failed'
          ? HttpStatus.UNPROCESSABLE_ENTITY
          : HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

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
        externalVoiceId: created.voiceId,
        isCloned: true,
        isDefaultSelectable: true,
        isVoiceActive: true,
        providerData: {
          heygen: { connection: created.connection, version: 1 },
        },
        sampleAudioUrl: voice.previewAudioUrl,
        voiceProvider: VoiceProvider.HEYGEN,
        voiceSource: 'cloned',
      },
    );
    return ingredientId;
  }

  private async waitForHeyGenVoice(
    organizationId: string,
    voiceId: string,
  ): Promise<HeyGenClonedVoice> {
    const deadline = Date.now() + HEYGEN_CLONE_WAIT_MS;
    for (;;) {
      const voice = await this.heyGenTwinService.getVoice(
        organizationId,
        voiceId,
      );
      if (voice.status !== 'pending' || Date.now() >= deadline) return voice;
      await new Promise((resolve) =>
        setTimeout(resolve, HEYGEN_CLONE_POLL_INTERVAL_MS),
      );
    }
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

/** Keeps a provider's 4xx (bad sample, missing key, rate limit) as the reply. */
function toHttpException(error: unknown): unknown {
  if (!(error instanceof HttpException)) return error;
  const status = error.getStatus();
  if (status >= 500) return error;
  const response = error.getResponse();
  const detail =
    typeof response === 'string'
      ? response
      : typeof response === 'object' &&
          response &&
          'message' in response &&
          typeof response.message === 'string'
        ? response.message
        : error.message;
  const isMissingKey = detail.startsWith(
    'Reconnect your personal HeyGen account',
  );
  return new HttpException(
    isMissingKey
      ? {
          detail:
            'Connect your HeyGen account in Settings → Integrations to clone your voice. The voice is created in your own account.',
          title: 'HeyGen account required',
        }
      : { detail, title: 'Cloning failed' },
    status,
  );
}
