import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { AGENT_RUNTIME_ACTION_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { countHeyGenSpeechCharacters } from '@api/services/integrations/heygen/helpers/heygen-speech';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenSpeechVoicesService } from '@api/services/integrations/heygen/services/heygen-speech-voices.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { RouterService } from '@api/services/router/router.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  FileInputType,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  RouterPriority,
  VoiceProvider,
} from '@genfeedai/contracts';
import {
  countSpeechCharacters,
  getVoiceSpeechModel,
  SPEECH_VOICE_PROVIDERS,
  type VoiceSpeechModel,
  voiceSpeechModelKeysFor,
} from '@genfeedai/contracts/constants';
import type { PinnedRuntimeSkill } from '@genfeedai/contracts/interfaces/ai';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';

export type VoiceGenerationActionResult = {
  cdnUrl?: string;
  duration?: number;
  id: string;
  s3Key?: string;
  status: string;
};

type VoiceGenerationParams = {
  brandId?: string;
  ingredientId: string;
  /** A `VOICE_SPEECH_MODELS` key, resolved at admission. */
  model: string;
  organizationId: string;
  pinnedSkills?: PinnedRuntimeSkill[];
  requestedSkillSlugs?: string[];
  text: string;
  userId: string;
  voiceId: string;
};

type GeneratedSpeech = {
  duration: number;
  s3Key?: string;
};

/** Who pays for the speech; a workspace's own provider key is never debited. */
type SpeechBillingMode = 'byok' | 'platform';

/** Stored on the ingredient so a replayed job settles the same charge. */
type SpeechBillingReceipt = {
  billingMode: SpeechBillingMode;
  characters: number;
  credits: number;
  modelKey: string;
  rateVersion: string | null;
};

const SPEECH_BILLING_KEY = 'speechBilling';

@Injectable()
export class VoiceGenerationService implements OnModuleInit {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly elevenLabsService: ElevenLabsService,
    private readonly heygenService: HeyGenService,
    private readonly heygenSpeechVoices: HeyGenSpeechVoicesService,
    private readonly filesClientService: FilesClientService,
    private readonly routerService: RouterService,
    private readonly loggerService: LoggerService,
    private readonly sharedService: SharedService,
    private readonly voiceCreditsService: VoiceCreditsService,
    private readonly voicesService: VoicesService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly activitiesService: ActivitiesService,

    private readonly activityRecorder: ActivityRecorderService,
    private readonly notifications: NotificationsPublisherService,
    @Optional() private readonly skillRuntime?: SkillRuntimeService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      AGENT_RUNTIME_ACTION_IDS.VOICE_GENERATION,
      ({ input }) => {
        // The workflow engine validates this action input before execution.
        return this.executeQueuedGeneration(
          input as unknown as VoiceGenerationParams,
        );
      },
    );
  }

  async generate(
    user: User,
    dto: GenerateVoiceDto,
  ): Promise<IngredientDocument> {
    this.validateRequest(dto);
    const userId = user.userId ?? user.id;

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
          await this.recordActivity(
            String(accepted.id),
            user.organizationId,
            userId,
            user.brandId,
            'processing',
          );
          const acceptedModel =
            typeof accepted.modelUsed === 'string' &&
            getVoiceSpeechModel(accepted.modelUsed)
              ? accepted.modelUsed
              : await this.resolveSpeechModelKey(user.organizationId, dto);
          await this.enqueueGeneration({
            brandId: user.brandId,
            ingredientId: String(accepted.id),
            model: acceptedModel,
            organizationId: user.organizationId,
            requestedSkillSlugs: dto.requestedSkillSlugs,
            text: dto.text,
            userId,
            voiceId: dto.voiceId,
          });
        }
        return accepted;
      }
    }

    const model = await this.resolveSpeechModelKey(user.organizationId, dto);
    const speechModel = this.requireSpeechModel(model);
    // The admitted text prices the hold; dispatch re-quotes the exact text
    // sent, which selected skills may rewrite.
    const characters = this.countBillableCharacters(speechModel, dto.text);
    this.assertWithinTextLimit(speechModel, characters);
    const billingMode = await this.resolveBillingMode(
      speechModel,
      user.organizationId,
      dto.voiceId,
    );
    const quote = await this.voiceCreditsService.quoteSpeech({
      characters,
      modelKey: model,
      organizationId: user.organizationId,
      provider: this.quoteProvider(speechModel),
    });
    if (billingMode === 'platform')
      await this.voiceCreditsService.assertOrganizationCanAfford(
        user.organizationId,
        quote.credits,
      );

    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        origin: IngredientOrigin.GENERATED,
        brandId: user.brandId,
        category: IngredientCategory.VOICE,
        extension:
          speechModel.voiceProvider === VoiceProvider.HEYGEN
            ? MetadataExtension.WAV
            : MetadataExtension.MP3,
        model,
        organizationId: user.organizationId,
        status: IngredientStatus.PROCESSING,
        sourceActionId: dto.sourceActionId,
        voiceSource: 'generated',
      },
    );
    const ingredientId = String(ingredientData.id);
    await this.recordActivity(
      ingredientId,
      user.organizationId,
      userId,
      user.brandId,
      'processing',
    );

    await this.enqueueGeneration({
      brandId: user.brandId,
      ingredientId,
      model,
      requestedSkillSlugs: dto.requestedSkillSlugs,
      organizationId: user.organizationId,
      text: dto.text,
      userId,
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

  /**
   * An explicit model must speak the voice's catalog; Auto routes among the
   * speech models that can. Both go through the router so the row is
   * enabled for the workspace and priceable.
   */
  private async resolveSpeechModelKey(
    organizationId: string,
    dto: GenerateVoiceDto,
  ): Promise<string> {
    const voiceProvider = dto.voiceProvider ?? VoiceProvider.ELEVENLABS;
    if (!SPEECH_VOICE_PROVIDERS.includes(voiceProvider))
      throw new BadRequestException(
        `Speech generation does not support ${voiceProvider} voices`,
      );
    const explicitModel = dto.autoSelectModel ? undefined : dto.model;
    if (explicitModel) {
      const speechModel = getVoiceSpeechModel(explicitModel);
      if (!speechModel)
        throw new BadRequestException(`${explicitModel} is not a speech model`);
      if (speechModel.voiceProvider !== voiceProvider)
        throw new BadRequestException(
          `${explicitModel} cannot speak this voice. Pick a matching voice or model.`,
        );
    }
    const recommendation = await this.routerService.selectModel({
      category: ModelCategory.VOICE,
      eligibleModelKeys: explicitModel
        ? [explicitModel]
        : voiceSpeechModelKeysFor(voiceProvider),
      organizationId,
      prioritize: dto.prioritize ?? RouterPriority.BALANCED,
      prompt: dto.text,
    });
    return recommendation.selectedModel;
  }

  private requireSpeechModel(model: string): VoiceSpeechModel {
    const speechModel = getVoiceSpeechModel(model);
    if (!speechModel)
      throw new BadRequestException(`${model} is not a speech model`);
    return speechModel;
  }

  /** HeyGen bills its own documented count; ElevenLabs counts the same way. */
  private countBillableCharacters(
    speechModel: VoiceSpeechModel,
    text: string,
  ): number {
    return speechModel.voiceProvider === VoiceProvider.HEYGEN
      ? countHeyGenSpeechCharacters(text)
      : countSpeechCharacters(text);
  }

  private assertWithinTextLimit(
    speechModel: VoiceSpeechModel,
    characters: number,
  ): void {
    if (characters > speechModel.maxCharacters)
      throw new BadRequestException(
        `This voice model speaks at most ${speechModel.maxCharacters.toLocaleString('en-US')} characters per request.`,
      );
  }

  /** The registry provider whose reviewed rate prices the model. */
  private quoteProvider(speechModel: VoiceSpeechModel): string {
    return speechModel.voiceProvider === VoiceProvider.HEYGEN
      ? 'heygen'
      : 'elevenlabs';
  }

  /**
   * HeyGen speaks with the workspace's own key when one is connected, and
   * that key is never debited. ElevenLabs speaks with the platform key
   * because the voice catalog's voices live on the platform account.
   */
  private async resolveBillingMode(
    speechModel: VoiceSpeechModel,
    organizationId: string,
    voiceId: string,
  ): Promise<SpeechBillingMode> {
    if (speechModel.voiceProvider !== VoiceProvider.HEYGEN) return 'platform';
    const connection = await this.heygenSpeechVoices.resolveSpeechConnection(
      organizationId,
      voiceId,
    );
    return connection.binding.kind === 'byok' ? 'byok' : 'platform';
  }

  private async enqueueGeneration(
    params: VoiceGenerationParams,
  ): Promise<void> {
    const pinnedSkills = await this.pinsForVoice(params);
    await this.workflowRunner.enqueueWorkflow(
      {
        actionType: 'voice.generate',
        canonicalId: 'voice.generate',
        inputValues: {
          ingredientId: params.ingredientId,
          model: params.model,
          organizationId: params.organizationId,
          text: params.text,
          userId: params.userId,
          voiceId: params.voiceId,
          ...(params.requestedSkillSlugs?.length
            ? {
                ...(params.brandId ? { brandId: params.brandId } : {}),
                requestedSkillSlugs: params.requestedSkillSlugs,
              }
            : {}),
          ...(pinnedSkills.length > 0 ? { pinnedSkills } : {}),
        },
        metadata: {
          ingredientId: params.ingredientId,
          retentionClass: 'ephemeral-processing',
        },
        organizationId: params.organizationId,
        source: 'VoiceGenerationService.generate',
        userId: params.userId,
      },
      { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
    );
  }

  async executeQueuedGeneration(
    params: VoiceGenerationParams,
  ): Promise<VoiceGenerationActionResult> {
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
      await this.settleSpeech(this.readBillingReceipt(existing.providerData), {
        brandId: existing.brandId ?? params.brandId,
        ingredientId: params.ingredientId,
        organizationId: params.organizationId,
        userId: params.userId,
      });
      await this.recordActivity(
        params.ingredientId,
        params.organizationId,
        params.userId,
        existing.brandId ?? undefined,
        'completed',
      );
      return this.toActionResult(existing);
    }
    const generated = await this.executeGeneration({
      ...params,
      brandId: existing?.brandId ?? undefined,
    });
    await this.recordActivity(
      params.ingredientId,
      params.organizationId,
      params.userId,
      generated.brandId ?? existing?.brandId ?? undefined,
      'completed',
    );
    return this.toActionResult(generated);
  }

  private async recordActivity(
    ingredientId: string,
    organizationId: string,
    userId: string,
    brandId: string | undefined,
    status: 'processing' | 'completed' | 'failed',
  ): Promise<void> {
    try {
      const existing = await this.activitiesService.findOne({
        entityId: ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        organizationId,
        userId,
        isDeleted: false,
        action: {
          in: [
            ActivityKey.VOICE_PROCESSING,
            ActivityKey.VOICE_GENERATED,
            ActivityKey.VOICE_FAILED,
          ],
        },
      });
      if (status === 'processing' && existing) return;
      const key =
        status === 'processing'
          ? ActivityKey.VOICE_PROCESSING
          : status === 'completed'
            ? ActivityKey.VOICE_GENERATED
            : ActivityKey.VOICE_FAILED;
      if (existing?.key === key) return;
      const data = {
        brandId,
        entityId: ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        organizationId,
        userId,
        key,
        source: ActivitySource.VOICE_GENERATION,
        isRead: false,
        value: JSON.stringify({
          ingredientId,
          resultId: ingredientId,
          resultType: 'VOICE',
        }),
      };
      const activity = existing
        ? ((await this.activityRecorder.update(existing, data)) ?? existing)
        : await this.activityRecorder.record(data);
      await this.notifications.publishBackgroundTaskUpdate({
        activityId: String(activity.id),
        taskId: ingredientId,
        resultId: ingredientId,
        status,
        label: 'Voice generation',
        userId,
      });
    } catch (error) {
      this.loggerService.error(
        'Failed to record voice generation activity',
        error,
      );
    }
  }

  private toActionResult(
    ingredient: IngredientDocument,
  ): VoiceGenerationActionResult {
    const record = ingredient as Record<string, unknown>;
    return {
      ...(typeof record.cdnUrl === 'string' ? { cdnUrl: record.cdnUrl } : {}),
      ...(typeof record.duration === 'number'
        ? { duration: record.duration }
        : {}),
      id: String(record.id),
      ...(typeof record.s3Key === 'string' ? { s3Key: record.s3Key } : {}),
      status: String(record.status),
    };
  }

  private async spokenText(params: VoiceGenerationParams): Promise<string> {
    if (!params.requestedSkillSlugs?.length) return params.text;
    if (!this.skillRuntime) {
      throw new HttpException(
        {
          detail: 'Selected skills are unavailable for this voice generation',
          title: 'Skill unavailable',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.skillRuntime.applyAuthorizedSkillPrompt({
      actorUserId: params.userId,
      brandId: params.brandId,
      modality: 'audio',
      organizationId: params.organizationId,
      ...(params.pinnedSkills?.length
        ? { pinnedSkills: params.pinnedSkills }
        : {}),
      prompt: params.text,
      requestedSkillSlugs: params.requestedSkillSlugs,
    });
  }

  private async pinsForVoice(
    params: VoiceGenerationParams,
  ): Promise<PinnedRuntimeSkill[]> {
    if (params.pinnedSkills && params.pinnedSkills.length > 0) {
      return params.pinnedSkills;
    }
    if (
      !this.skillRuntime ||
      !params.brandId ||
      !params.requestedSkillSlugs?.length
    ) {
      return [];
    }
    return this.skillRuntime.collectAuthorizedPins({
      actorUserId: params.userId,
      brandId: params.brandId,
      modality: 'audio',
      organizationId: params.organizationId,
      requestedSkillSlugs: params.requestedSkillSlugs,
    });
  }

  private async executeGeneration(
    params: VoiceGenerationParams,
  ): Promise<IngredientDocument> {
    let receipt: SpeechBillingReceipt;
    try {
      const speechModel = this.requireSpeechModel(params.model);
      const text = await this.spokenText(params);
      const characters = this.countBillableCharacters(speechModel, text);
      this.assertWithinTextLimit(speechModel, characters);
      // Dispatch guard: the exact text sent is quoted, and only a reviewed
      // per-character rate may price it.
      const isHeyGen = speechModel.voiceProvider === VoiceProvider.HEYGEN;
      const connection = isHeyGen
        ? await this.heygenSpeechVoices.resolveSpeechConnection(
            params.organizationId,
            params.voiceId,
          )
        : undefined;
      const quote = await this.voiceCreditsService.quoteSpeech({
        characters,
        modelKey: params.model,
        organizationId: params.organizationId,
        provider: this.quoteProvider(speechModel),
      });
      receipt = {
        billingMode: connection?.binding.kind === 'byok' ? 'byok' : 'platform',
        characters,
        credits: quote.credits,
        modelKey: params.model,
        rateVersion: quote.rateVersion,
      };

      const speech = connection
        ? await this.generateHeyGenSpeech(params, text, connection.apiKey)
        : await this.generateElevenLabsSpeech(params, text, speechModel);

      await this.voicesService.patchAll(
        {
          id: params.ingredientId,
          isDeleted: false,
          organizationId: params.organizationId,
        },
        {
          duration: speech.duration,
          providerData: { [SPEECH_BILLING_KEY]: receipt },
          // The object key is the stored identity; the URL is derived on read.
          ...(speech.s3Key ? { s3Key: speech.s3Key } : {}),
          status: IngredientStatus.GENERATED,
        },
      );
    } catch (error: unknown) {
      return await this.handleFailure(
        params.ingredientId,
        params.organizationId,
        error,
        params.userId,
        params.brandId,
      );
    }

    await this.recordActivity(
      params.ingredientId,
      params.organizationId,
      params.userId,
      params.brandId,
      'completed',
    );

    await this.settleSpeech(receipt, {
      brandId: params.brandId,
      ingredientId: params.ingredientId,
      organizationId: params.organizationId,
      userId: params.userId,
    });

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
  }

  private async generateElevenLabsSpeech(
    params: VoiceGenerationParams,
    text: string,
    speechModel: VoiceSpeechModel,
  ): Promise<GeneratedSpeech> {
    const result = await this.elevenLabsService.generateAndUploadAudio(
      params.voiceId,
      text,
      params.ingredientId,
      params.organizationId,
      params.userId,
      undefined,
      { modelId: speechModel.providerModelId },
    );
    return {
      duration: result.duration,
      ...(typeof result.uploadResult.s3Key === 'string'
        ? { s3Key: result.uploadResult.s3Key }
        : {}),
    };
  }

  /**
   * HeyGen returns a HeyGen-hosted WAV url; it is copied into our storage so
   * the ingredient never depends on HeyGen keeping the file.
   */
  private async generateHeyGenSpeech(
    params: VoiceGenerationParams,
    text: string,
    apiKey: string,
  ): Promise<GeneratedSpeech> {
    const speech = await this.heygenService.generateSpeech({
      apiKeyOverride: apiKey,
      organizationId: params.organizationId,
      text,
      voiceId: params.voiceId,
    });
    const uploaded = await this.filesClientService.uploadToS3(
      `${params.ingredientId}.wav`,
      // Same storage family as ElevenLabs speech, so reads resolve one way.
      'musics',
      { type: FileInputType.URL, url: speech.audioUrl },
    );
    if (typeof uploaded.s3Key !== 'string' || !uploaded.s3Key)
      throw new Error('HeyGen Voice audio could not be stored');
    return {
      duration: speech.duration ?? uploaded.duration ?? 0,
      s3Key: uploaded.s3Key,
    };
  }

  /** A workspace's own provider key is never debited for platform credits. */
  private async settleSpeech(
    receipt: SpeechBillingReceipt | undefined,
    params: {
      brandId?: string | null;
      ingredientId: string;
      organizationId: string;
      userId: string;
    },
  ): Promise<void> {
    if (!receipt) {
      this.loggerService.warn(
        `${this.constructorName} generated voice has no billing receipt`,
        { ingredientId: params.ingredientId },
      );
      return;
    }
    if (receipt.billingMode === 'byok') return;
    await this.voiceCreditsService.settleSpeechCredits({
      ...params,
      credits: receipt.credits,
    });
  }

  private readBillingReceipt(
    providerData: unknown,
  ): SpeechBillingReceipt | undefined {
    if (!providerData || typeof providerData !== 'object') return undefined;
    const receipt = (providerData as Record<string, unknown>)[
      SPEECH_BILLING_KEY
    ];
    if (!receipt || typeof receipt !== 'object') return undefined;
    const { billingMode, characters, credits, modelKey, rateVersion } =
      receipt as Record<string, unknown>;
    return (billingMode === 'byok' || billingMode === 'platform') &&
      typeof characters === 'number' &&
      typeof credits === 'number' &&
      typeof modelKey === 'string' &&
      (typeof rateVersion === 'string' || rateVersion === null)
      ? { billingMode, characters, credits, modelKey, rateVersion }
      : undefined;
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
    userId: string,
    brandId?: string,
  ): Promise<never> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.error(`${url} voice generation failed`, error);
    await this.voicesService.patchAll(
      { id: ingredientId, isDeleted: false, organizationId },
      { status: IngredientStatus.FAILED },
    );
    await this.recordActivity(
      ingredientId,
      organizationId,
      userId,
      brandId,
      'failed',
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
