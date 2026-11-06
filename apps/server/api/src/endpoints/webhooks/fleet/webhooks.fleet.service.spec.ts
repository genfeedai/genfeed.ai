import type { VoicesService } from '@api/collections/voices/services/voices.service';
import { FleetWebhookService } from '@api/endpoints/webhooks/fleet/webhooks.fleet.service';
import type { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

const matches = (row: Row, filter: Row) =>
  Object.entries(filter).every(([key, value]) => row[key] === value);

describe('FleetWebhookService', () => {
  let voices: Row[];
  let deductions: Row[];
  let notifications: { id: string; status: string; userId: string }[];
  let service: FleetWebhookService;

  beforeEach(() => {
    voices = [
      {
        brandId: 'brand-1',
        category: IngredientCategory.VOICE,
        cloneStatus: VoiceCloneStatus.PENDING,
        id: 'voice-asset-1',
        organizationId: 'org-1',
        providerData: { fleet: { jobId: 'old-job' } },
        status: IngredientStatus.PROCESSING,
        userId: 'user-1',
        voiceProvider: VoiceProvider.GENFEED_AI,
      },
    ];
    deductions = [];
    notifications = [];
    const voicesService = {
      findOne: async (filter: Row) =>
        voices.find((row) => matches(row, filter)) ?? null,
      patchAll: async (filter: Row, update: Row) => {
        const hit = voices.filter((row) => matches(row, filter));
        for (const row of hit) Object.assign(row, update);
        return { modifiedCount: hit.length };
      },
    };
    service = new FleetWebhookService(
      voicesService as unknown as VoicesService,
      {
        queueDeduction: async (job: Row) => {
          deductions.push(job);
        },
      } as unknown as CreditDeductionQueueService,
      {
        publishAssetStatus: async (
          id: string,
          status: string,
          userId: string,
        ) => {
          notifications.push({ id, status, userId });
        },
      } as unknown as NotificationsPublisherService,
    );
  });

  it('deducts Fleet voice clone credits from measured process time on completion', async () => {
    const result = await service.handleVoiceCloneCompletion({
      handle: 'voice-asset-1',
      job_id: 'fleet-job-1',
      output: {
        sample_audio_url: 'https://cdn.example.com/sample.wav',
        voice_id: 'fleet-voice-1',
      },
      process_time: 61,
      status: 'completed',
    });

    expect(result).toMatchObject({
      chargedCredits: 18,
      jobId: 'fleet-job-1',
      processTimeSeconds: 61,
      status: 'charged',
    });
    expect(voices[0]).toMatchObject({
      cloneStatus: VoiceCloneStatus.READY,
      externalVoiceId: 'fleet-voice-1',
      sampleAudioUrl: 'https://cdn.example.com/sample.wav',
      status: IngredientStatus.GENERATED,
    });
    expect(deductions).toEqual([
      expect.objectContaining({
        amount: 18,
        brandId: 'brand-1',
        idempotencyKey: 'fleet-voice-clone-fleet-job-1',
        organizationId: 'org-1',
        referenceId: 'fleet-job-1',
        referenceType: 'fleet:voice-clone',
        source: ActivitySource.VOICE_GENERATION,
        type: 'deduct-credits',
        userId: 'user-1',
      }),
    ]);
    expect(notifications).toEqual([
      { id: 'voice-asset-1', status: VoiceCloneStatus.READY, userId: 'user-1' },
    ]);
  });

  it('does not charge failed or cancelled Fleet clone jobs', async () => {
    const result = await service.handleVoiceCloneCompletion({
      error: 'cancelled by provider',
      handle: 'voice-asset-1',
      jobId: 'fleet-job-2',
      processTimeSeconds: 42,
      status: 'cancelled',
    });

    expect(result).toMatchObject({
      chargedCredits: 0,
      jobId: 'fleet-job-2',
      status: 'failed',
    });
    expect(voices[0]).toMatchObject({
      cloneStatus: VoiceCloneStatus.FAILED,
      status: IngredientStatus.FAILED,
    });
    expect(deductions).toEqual([]);
    expect(notifications).toEqual([
      {
        id: 'voice-asset-1',
        status: VoiceCloneStatus.FAILED,
        userId: 'user-1',
      },
    ]);
  });

  it('ignores a callback for a job that is still running', async () => {
    const result = await service.handleVoiceCloneCompletion({
      handle: 'voice-asset-1',
      job_id: 'fleet-job-3',
      status: 'running',
    });

    expect(result).toEqual({
      chargedCredits: 0,
      jobId: 'fleet-job-3',
      status: 'ignored',
    });
    expect(voices[0]).toMatchObject({ cloneStatus: VoiceCloneStatus.PENDING });
    expect(deductions).toEqual([]);
  });

  it('rejects a completion for a voice Fleet does not own', async () => {
    await expect(
      service.handleVoiceCloneCompletion({
        handle: 'unknown-voice',
        job_id: 'fleet-job-4',
        process_time: 10,
        status: 'completed',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(deductions).toEqual([]);
  });
});
