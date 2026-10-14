import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { readSpeechReceipt } from '@api/collections/voices/utils/elevenlabs-voice-binding.schema';
import { AGENT_RUNTIME_ACTION_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { toElevenLabsActionableError } from '@api/services/integrations/elevenlabs/elevenlabs-error.util';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import {
  ElevenLabsConnectionService,
  type ResolvedElevenLabsConnection,
} from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import type { ElevenLabsSpeechReceipt } from '@genfeedai/contracts/interfaces';
import type { PinnedRuntimeSkill } from '@genfeedai/contracts/interfaces/ai';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  ConflictException,
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
  organizationId: string;
  pinnedSkills?: PinnedRuntimeSkill[];
  requestedSkillSlugs?: string[];
  text: string;
  userId: string;
  voiceId: string;
};

@Injectable()
export class VoiceGenerationService implements OnModuleInit {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly accountVoicesService: ElevenLabsAccountVoicesService,
    private readonly connectionService: ElevenLabsConnectionService,
    private readonly elevenLabsService: ElevenLabsService,
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
            user.userId ?? user.id,
            user.brandId,
            'processing',
          );
          await this.enqueueGeneration({
            brandId: user.brandId,
            ingredientId: String(accepted.id),
            organizationId: user.organizationId,
            requestedSkillSlugs: dto.requestedSkillSlugs,
            text: dto.text,
            userId: user.userId ?? user.id,
            voiceId: dto.voiceId,
          });
        }
        return accepted;
      }
    }

    const receipt = await this.bindSpeechRequest(
      user.organizationId,
      dto.voiceId,
    );
    if (receipt.connection.kind === 'platform') {
      await this.voiceCreditsService.assertOrganizationCanAfford(
        user.organizationId,
        1,
      );
    }

    const { ingredientData } = await this.sharedService.createMediaDocuments(
      user,
      {
        origin: IngredientOrigin.GENERATED,
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
    await this.voicesService.patchAll(
      { id: ingredientId, organizationId: user.organizationId },
      { generationProvider: toPrismaJson(receipt) },
    );
    await this.recordActivity(
      ingredientId,
      user.organizationId,
      user.userId ?? user.id,
      user.brandId,
      'processing',
    );

    await this.enqueueGeneration({
      brandId: user.brandId,
      ingredientId,
      requestedSkillSlugs: dto.requestedSkillSlugs,
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
    const receipt = readSpeechReceipt(existing?.generationProvider);
    if (
      (existing?.cdnUrl || existing?.s3Key) &&
      ['GENERATED', 'VALIDATED'].includes(String(existing.status).toUpperCase())
    ) {
      await this.settleCredits(receipt, {
        brandId: existing.brandId ?? params.brandId,
        durationSeconds: Number(existing.duration) || 0,
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
    const generated = await this.executeGeneration(
      {
        ...params,
        brandId: existing?.brandId ?? undefined,
      },
      receipt,
    );
    await this.recordActivity(
      params.ingredientId,
      params.organizationId,
      params.userId,
      generated.brandId ?? existing?.brandId ?? undefined,
      'completed',
    );
    return this.toActionResult(generated);
  }

  /** Binds the voice and the account that will speak it, before any work. */
  private async bindSpeechRequest(
    organizationId: string,
    voiceId: string,
  ): Promise<ElevenLabsSpeechReceipt> {
    const voice = await this.accountVoicesService.resolveSpeechVoice(
      organizationId,
      voiceId,
    );
    const connection = await this.connectionService.resolve(
      organizationId,
      voice.connectionKind,
    );
    return {
      connection: connection.binding,
      organizationId,
      provider: 'elevenlabs',
      state: 'accepted',
      version: 1,
      voice: {
        externalVoiceId: voice.externalVoiceId,
        ...(voice.internalVoiceId
          ? { internalVoiceId: voice.internalVoiceId }
          : {}),
      },
    };
  }

  /** The submitting account must still be the bound one. */
  private async resolveBoundConnection(
    receipt: ElevenLabsSpeechReceipt,
  ): Promise<ResolvedElevenLabsConnection> {
    const connection = await this.connectionService.resolve(
      receipt.organizationId,
      receipt.connection.kind,
    );
    if (
      receipt.connection.kind === 'byok' &&
      connection.binding.credentialVersionId !==
        receipt.connection.credentialVersionId
    ) {
      throw new BadRequestException(
        'The ElevenLabs connection changed after this voice was requested. Generate it again.',
      );
    }
    return connection;
  }

  /**
   * One-way claim on the paid provider call. A retry that finds the request
   * already submitted without stored audio cannot know whether ElevenLabs
   * produced (and billed) it, so it fails instead of sending it again.
   */
  private async claimSubmission(
    params: VoiceGenerationParams,
    receipt: ElevenLabsSpeechReceipt,
    hasStoredReceipt: boolean,
  ): Promise<void> {
    const { count } = await this.voicesService.prisma.ingredient.updateMany({
      data: {
        generationProvider: toPrismaJson({ ...receipt, state: 'submitted' }),
      },
      where: {
        generationProvider: hasStoredReceipt
          ? { equals: 'accepted', path: ['state'] }
          : { equals: Prisma.DbNull },
        id: params.ingredientId,
        isDeleted: false,
        organizationId: params.organizationId,
      },
    });
    if (count === 0) {
      throw new ConflictException(
        'An earlier attempt of this voice generation has an unknown result, so it was not sent again. Generate it again.',
      );
    }
  }

  private async settleCredits(
    receipt: ElevenLabsSpeechReceipt | undefined,
    params: {
      brandId?: string | null;
      durationSeconds: number;
      ingredientId: string;
      organizationId: string;
      userId: string;
    },
  ): Promise<void> {
    // The connected account pays ElevenLabs directly for personal voices.
    if (receipt?.connection.kind === 'byok') {
      return;
    }
    await this.voiceCreditsService.settleBackgroundGenerationCredits(params);
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
    storedReceipt: ElevenLabsSpeechReceipt | undefined,
  ): Promise<IngredientDocument> {
    let receipt = storedReceipt;
    let result: {
      audioUrl: string;
      duration: number;
      uploadResult: Record<string, unknown>;
    };
    try {
      // Jobs accepted before speech receipts existed bind at execution.
      receipt ??= await this.bindSpeechRequest(
        params.organizationId,
        params.voiceId,
      );
      const connection = await this.resolveBoundConnection(receipt);
      const text = await this.spokenText(params);
      await this.claimSubmission(params, receipt, storedReceipt !== undefined);

      try {
        result = await this.elevenLabsService.generateAndUploadAudio(
          receipt.voice.externalVoiceId,
          text,
          params.ingredientId,
          params.organizationId,
          params.userId,
          connection.apiKey,
        );
      } catch (error: unknown) {
        throw toElevenLabsActionableError(error);
      }

      await this.voicesService.patchAll(
        {
          id: params.ingredientId,
          isDeleted: false,
          organizationId: params.organizationId,
        },
        {
          duration: result.duration,
          generationProvider: toPrismaJson({ ...receipt, state: 'completed' }),
          // The object key is the stored identity; the URL is derived on read.
          ...(typeof result.uploadResult.s3Key === 'string'
            ? { s3Key: result.uploadResult.s3Key }
            : {}),
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

    await this.settleCredits(receipt, {
      brandId: params.brandId,
      durationSeconds: result.duration,
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
    // A concurrent attempt that already stored audio keeps its result.
    await this.voicesService.patchAll(
      { id: ingredientId, isDeleted: false, organizationId, s3Key: null },
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
