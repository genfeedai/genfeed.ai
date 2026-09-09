import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { GenerateVoiceDto } from '@api/collections/voices/dto/generate-voice.dto';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { AGENT_RUNTIME_ACTION_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  HttpException,
  HttpStatus,
  Injectable,
  type OnModuleInit,
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
  text: string;
  userId: string;
  voiceId: string;
};

@Injectable()
export class VoiceGenerationService implements OnModuleInit {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly elevenLabsService: ElevenLabsService,
    private readonly loggerService: LoggerService,
    private readonly sharedService: SharedService,
    private readonly voiceCreditsService: VoiceCreditsService,
    private readonly voicesService: VoicesService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly activitiesService: ActivitiesService,
    private readonly notifications: NotificationsPublisherService,
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
    await this.recordActivity(
      ingredientId,
      user.organizationId,
      user.userId ?? user.id,
      user.brandId,
      'processing',
    );

    await this.enqueueGeneration({
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

  private async enqueueGeneration(
    params: VoiceGenerationParams,
  ): Promise<void> {
    await this.workflowRunner.enqueueWorkflow({
      actionType: 'voice.generate',
      canonicalId: 'voice.generate',
      inputValues: params,
      metadata: {
        ingredientId: params.ingredientId,
        retentionClass: 'ephemeral-processing',
      },
      organizationId: params.organizationId,
      source: 'VoiceGenerationService.generate',
      userId: params.userId,
    });
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
      await this.voiceCreditsService.settleBackgroundGenerationCredits({
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
        ? await this.activitiesService.patch(String(existing.id), data)
        : await this.activitiesService.create(data);
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

  private async executeGeneration(
    params: VoiceGenerationParams,
  ): Promise<IngredientDocument> {
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

    await this.voiceCreditsService.settleBackgroundGenerationCredits({
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
