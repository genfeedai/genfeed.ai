import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import {
  calculateFleetComputeCredits,
  FLEET_COMPUTE_CREDIT_RATES,
} from '@api/services/integrations/fleet/fleet-compute-billing.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface FleetVoiceCloneWebhookPayload {
  assetId?: string;
  duration?: number;
  durationSeconds?: number;
  duration_seconds?: number;
  error?: unknown;
  handle?: string;
  id?: string;
  ingredientId?: string;
  job_id?: string;
  jobId?: string;
  metrics?: Record<string, unknown>;
  output?: Record<string, unknown>;
  process_time?: number;
  process_time_seconds?: number;
  processTime?: number;
  processTimeMs?: number;
  processTimeSeconds?: number;
  processing_time?: number;
  processingTime?: number;
  result?: Record<string, unknown>;
  sampleAudioUrl?: string;
  sample_audio_url?: string;
  state?: string;
  status?: string;
  voice_id?: string;
  voiceId?: string;
}

type FleetWebhookOutcome = {
  chargedCredits: number;
  jobId?: string;
  processTimeSeconds?: number;
  status: 'charged' | 'failed' | 'ignored';
};

const FLEET_VOICE_CLONE_REFERENCE_TYPE = 'fleet:voice-clone';

@Injectable()
export class FleetWebhookService {
  constructor(
    private readonly voicesService: VoicesService,
    private readonly creditDeductionQueueService: CreditDeductionQueueService,
    private readonly notificationsPublisherService: NotificationsPublisherService,
  ) {}

  async handleVoiceCloneCompletion(
    payload: FleetVoiceCloneWebhookPayload,
  ): Promise<FleetWebhookOutcome> {
    const status = this.normalizeTerminalStatus(
      payload.status ?? payload.state,
    );

    if (status === 'pending') {
      return {
        chargedCredits: 0,
        jobId: this.readJobId(payload),
        status: 'ignored',
      };
    }

    const ingredientId = this.readIngredientId(payload);
    if (!ingredientId) {
      throw new BadRequestException(
        'Fleet voice clone callback missing handle',
      );
    }

    const voice = await this.findFleetVoice(ingredientId);
    if (!voice) {
      throw new NotFoundException({
        message: 'Fleet voice clone asset not found',
      });
    }
    this.organizationId(voice);
    this.userId(voice);

    if (status === 'failed') {
      await this.markVoiceCloneFailed(voice, payload);
      return {
        chargedCredits: 0,
        jobId: this.readJobId(payload),
        status: 'failed',
      };
    }

    const processTimeSeconds = this.readProcessTimeSeconds(payload);
    if (!processTimeSeconds) {
      throw new BadRequestException(
        'Fleet voice clone completion missing process time',
      );
    }

    const chargedCredits = calculateFleetComputeCredits({
      jobKind: 'voice-clone',
      processTimeSeconds,
    });

    await this.markVoiceCloneReady(voice, payload, processTimeSeconds);
    await this.queueVoiceCloneDeduction(voice, payload, {
      chargedCredits,
      processTimeSeconds,
    });

    return {
      chargedCredits,
      jobId: this.readJobId(payload),
      processTimeSeconds,
      status: 'charged',
    };
  }

  private async findFleetVoice(
    ingredientId: string,
  ): Promise<IngredientDocument | null> {
    return await this.voicesService.findOne({
      OR: [{ id: ingredientId }, { mongoId: ingredientId }],
      category: IngredientCategory.VOICE,
      isDeleted: false,
      voiceProvider: VoiceProvider.GENFEED_AI,
    });
  }

  private async markVoiceCloneReady(
    voice: IngredientDocument,
    payload: FleetVoiceCloneWebhookPayload,
    processTimeSeconds: number,
  ): Promise<void> {
    const voiceId = this.readVoiceId(payload);
    const sampleAudioUrl = this.readSampleAudioUrl(payload);
    const update: Record<string, unknown> = {
      cloneStatus: VoiceCloneStatus.READY,
      providerData: this.buildProviderData(voice, payload, {
        processTimeSeconds,
        status: 'completed',
      }),
      status: IngredientStatus.GENERATED,
    };

    if (voiceId) {
      update.externalVoiceId = voiceId;
    }

    if (sampleAudioUrl) {
      update.sampleAudioUrl = sampleAudioUrl;
    }

    await this.patchVoice(voice, update);
    await this.publishVoiceStatus(voice, VoiceCloneStatus.READY, {
      chargedCredits: calculateFleetComputeCredits({
        jobKind: 'voice-clone',
        processTimeSeconds,
      }),
      cloneStatus: VoiceCloneStatus.READY,
      jobId: this.readJobId(payload),
      processTimeSeconds,
      provider: VoiceProvider.GENFEED_AI,
    });
  }

  private async markVoiceCloneFailed(
    voice: IngredientDocument,
    payload: FleetVoiceCloneWebhookPayload,
  ): Promise<void> {
    await this.patchVoice(voice, {
      cloneStatus: VoiceCloneStatus.FAILED,
      providerData: this.buildProviderData(voice, payload, {
        error: this.readError(payload),
        status: 'failed',
      }),
      status: IngredientStatus.FAILED,
    });

    await this.publishVoiceStatus(voice, VoiceCloneStatus.FAILED, {
      cloneStatus: VoiceCloneStatus.FAILED,
      error: this.readError(payload),
      jobId: this.readJobId(payload),
      provider: VoiceProvider.GENFEED_AI,
    });
  }

  private async patchVoice(
    voice: IngredientDocument,
    update: Record<string, unknown>,
  ): Promise<void> {
    const ingredientId = this.voiceId(voice);
    await this.voicesService.patchAll(
      {
        OR: [{ id: ingredientId }, { mongoId: ingredientId }],
        organizationId: voice.organizationId,
      },
      update,
    );
  }

  private async publishVoiceStatus(
    voice: IngredientDocument,
    status: VoiceCloneStatus,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.notificationsPublisherService.publishAssetStatus(
      this.voiceId(voice),
      status,
      this.userId(voice),
      metadata,
    );
  }

  private async queueVoiceCloneDeduction(
    voice: IngredientDocument,
    payload: FleetVoiceCloneWebhookPayload,
    params: { chargedCredits: number; processTimeSeconds: number },
  ): Promise<void> {
    const jobId = this.readJobId(payload) ?? this.voiceId(voice);
    const idempotencyKey = this.toQueueKey(`fleet-voice-clone-${jobId}`);

    await this.creditDeductionQueueService.queueDeduction({
      amount: params.chargedCredits,
      description: `Fleet voice clone compute (${params.processTimeSeconds.toFixed(2)}s)`,
      idempotencyKey,
      metadata: {
        fleetJobId: this.readJobId(payload),
        jobKind: 'voice-clone',
        processTimeSeconds: params.processTimeSeconds,
        rateCreditsPerSecond:
          FLEET_COMPUTE_CREDIT_RATES['voice-clone'].creditsPerSecond,
        voiceId: this.voiceId(voice),
      },
      organizationId: this.organizationId(voice),
      referenceId: jobId,
      referenceType: FLEET_VOICE_CLONE_REFERENCE_TYPE,
      source: ActivitySource.VOICE_GENERATION,
      type: 'deduct-credits',
      userId: this.userId(voice),
    });
  }

  private buildProviderData(
    voice: IngredientDocument,
    payload: FleetVoiceCloneWebhookPayload,
    update: Record<string, unknown>,
  ): Record<string, unknown> {
    const providerData = this.toRecord(voice.providerData);
    const fleetData = this.toRecord(providerData.fleet);

    return {
      ...providerData,
      fleet: {
        ...fleetData,
        jobId: this.readJobId(payload),
        jobKind: 'voice-clone',
        ...update,
      },
    };
  }

  private normalizeTerminalStatus(
    value: string | undefined,
  ): 'completed' | 'failed' | 'pending' {
    const status = value?.trim().toLowerCase();

    if (
      status === 'completed' ||
      status === 'succeeded' ||
      status === 'success' ||
      status === 'ready'
    ) {
      return 'completed';
    }

    if (
      status === 'failed' ||
      status === 'error' ||
      status === 'errored' ||
      status === 'cancelled' ||
      status === 'canceled'
    ) {
      return 'failed';
    }

    return 'pending';
  }

  private readIngredientId(
    payload: FleetVoiceCloneWebhookPayload,
  ): string | null {
    return (
      this.readString(payload.handle) ??
      this.readString(payload.ingredientId) ??
      this.readString(payload.assetId)
    );
  }

  private readJobId(
    payload: FleetVoiceCloneWebhookPayload,
  ): string | undefined {
    return (
      this.readString(payload.jobId) ??
      this.readString(payload.job_id) ??
      this.readString(payload.id)
    );
  }

  private readVoiceId(
    payload: FleetVoiceCloneWebhookPayload,
  ): string | undefined {
    const output = this.toRecord(payload.output);
    const result = this.toRecord(payload.result);

    return (
      this.readString(payload.voiceId) ??
      this.readString(payload.voice_id) ??
      this.readString(output.voiceId) ??
      this.readString(output.voice_id) ??
      this.readString(result.voiceId) ??
      this.readString(result.voice_id)
    );
  }

  private readSampleAudioUrl(
    payload: FleetVoiceCloneWebhookPayload,
  ): string | undefined {
    const output = this.toRecord(payload.output);
    const result = this.toRecord(payload.result);

    return (
      this.readString(payload.sampleAudioUrl) ??
      this.readString(payload.sample_audio_url) ??
      this.readString(output.sampleAudioUrl) ??
      this.readString(output.sample_audio_url) ??
      this.readString(result.sampleAudioUrl) ??
      this.readString(result.sample_audio_url)
    );
  }

  private readProcessTimeSeconds(
    payload: FleetVoiceCloneWebhookPayload,
  ): number | null {
    const metrics = this.toRecord(payload.metrics);
    const seconds =
      this.readPositiveNumber(payload.processTimeSeconds) ??
      this.readPositiveNumber(payload.process_time_seconds) ??
      this.readPositiveNumber(payload.processTime) ??
      this.readPositiveNumber(payload.process_time) ??
      this.readPositiveNumber(payload.processingTime) ??
      this.readPositiveNumber(payload.processing_time) ??
      this.readPositiveNumber(payload.durationSeconds) ??
      this.readPositiveNumber(payload.duration_seconds) ??
      this.readPositiveNumber(payload.duration) ??
      this.readPositiveNumber(metrics.processTimeSeconds) ??
      this.readPositiveNumber(metrics.process_time_seconds) ??
      this.readPositiveNumber(metrics.processTime) ??
      this.readPositiveNumber(metrics.process_time) ??
      this.readPositiveNumber(metrics.processingTime) ??
      this.readPositiveNumber(metrics.processing_time) ??
      this.readPositiveNumber(metrics.predict_time) ??
      this.readPositiveNumber(metrics.total_time);

    if (seconds) {
      return seconds;
    }

    const milliseconds =
      this.readPositiveNumber(payload.processTimeMs) ??
      this.readPositiveNumber(metrics.processTimeMs) ??
      this.readPositiveNumber(metrics.process_time_ms);

    return milliseconds ? milliseconds / 1000 : null;
  }

  private readError(
    payload: FleetVoiceCloneWebhookPayload,
  ): string | undefined {
    if (typeof payload.error === 'string') {
      return payload.error;
    }

    const error = this.toRecord(payload.error);
    return this.readString(error.message) ?? this.readString(error.detail);
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readPositiveNumber(value: unknown): number | undefined {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0
      ? numberValue
      : undefined;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toQueueKey(value: string): string {
    return value.replace(/[^A-Za-z0-9_-]/g, '_');
  }

  private voiceId(voice: IngredientDocument): string {
    return String(voice.id ?? voice._id);
  }

  private organizationId(voice: IngredientDocument): string {
    if (!voice.organizationId) {
      throw new BadRequestException(
        'Fleet voice clone asset is missing organizationId',
      );
    }

    return voice.organizationId;
  }

  private userId(voice: IngredientDocument): string {
    if (!voice.userId) {
      throw new BadRequestException(
        'Fleet voice clone asset is missing userId',
      );
    }

    return voice.userId;
  }
}
