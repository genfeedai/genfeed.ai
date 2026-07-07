import { FleetWebhookService } from '@api/endpoints/webhooks/fleet/webhooks.fleet.service';
import {
  ActivitySource,
  IngredientStatus,
  VoiceCloneStatus,
} from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('FleetWebhookService', () => {
  let service: FleetWebhookService;
  let voicesService: {
    findOne: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
  };
  let creditDeductionQueueService: {
    queueDeduction: ReturnType<typeof vi.fn>;
  };
  let notificationsPublisherService: {
    publishAssetStatus: ReturnType<typeof vi.fn>;
  };

  const voice = {
    _id: 'voice-asset-1',
    id: 'voice-asset-1',
    organizationId: 'org-1',
    providerData: { fleet: { jobId: 'old-job' } },
    userId: 'user-1',
  };

  beforeEach(() => {
    voicesService = {
      findOne: vi.fn().mockResolvedValue(voice),
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    creditDeductionQueueService = {
      queueDeduction: vi.fn().mockResolvedValue(undefined),
    };
    notificationsPublisherService = {
      publishAssetStatus: vi.fn().mockResolvedValue(undefined),
    };

    service = new FleetWebhookService(
      voicesService as never,
      creditDeductionQueueService as never,
      notificationsPublisherService as never,
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
    expect(voicesService.patchAll).toHaveBeenCalledWith(
      expect.objectContaining({
        OR: [{ id: 'voice-asset-1' }, { mongoId: 'voice-asset-1' }],
        organizationId: 'org-1',
      }),
      expect.objectContaining({
        cloneStatus: VoiceCloneStatus.READY,
        externalVoiceId: 'fleet-voice-1',
        sampleAudioUrl: 'https://cdn.example.com/sample.wav',
        status: IngredientStatus.GENERATED,
      }),
    );
    expect(creditDeductionQueueService.queueDeduction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 18,
        idempotencyKey: 'fleet-voice-clone-fleet-job-1',
        organizationId: 'org-1',
        referenceId: 'fleet-job-1',
        referenceType: 'fleet:voice-clone',
        source: ActivitySource.VOICE_GENERATION,
        type: 'deduct-credits',
        userId: 'user-1',
      }),
    );
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
    expect(voicesService.patchAll).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        cloneStatus: VoiceCloneStatus.FAILED,
        status: IngredientStatus.FAILED,
      }),
    );
    expect(creditDeductionQueueService.queueDeduction).not.toHaveBeenCalled();
  });
});
