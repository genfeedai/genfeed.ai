import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import {
  IngredientStatus,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { VoiceCreditsService } from '@server/collections/voices/services/voice-credits.service';
import { VoicesService } from '@server/collections/voices/services/voices.service';
import { ByokService } from '@server/services/byok/byok.service';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import { ManagedInferenceRuntimeService } from '@server/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@server/shared/services/shared/shared.service';
import type { Request } from 'express';

describe('VoiceCloneService', () => {
  const ingredientId = testId('ingredient');
  const organizationId = testId('org');
  const userId = testId('user');
  const user = {
    id: 'auth-user-1',
    brandId: testId('brand'),
    organizationId: organizationId,
    userId,
  } as User;
  const request = {} as Request;
  let byok: { resolveApiKey: ReturnType<typeof vi.fn> };
  let elevenLabs: {
    cloneVoice: ReturnType<typeof vi.fn>;
    deleteVoice: ReturnType<typeof vi.fn>;
  };
  let managedInferenceRuntime: {
    cloneVoice: ReturnType<typeof vi.fn>;
    isAvailable: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let notifications: { publishAssetStatus: ReturnType<typeof vi.fn> };
  let shared: { createMediaDocuments: ReturnType<typeof vi.fn> };
  let credits: { settleElevenLabsCloneCredits: ReturnType<typeof vi.fn> };
  let voices: {
    findOne: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
  };
  let service: VoiceCloneService;

  beforeEach(() => {
    byok = { resolveApiKey: vi.fn().mockResolvedValue({ apiKey: 'key' }) };
    elevenLabs = {
      cloneVoice: vi.fn().mockResolvedValue({ voiceId: 'external-voice-1' }),
      deleteVoice: vi.fn(),
    };
    managedInferenceRuntime = {
      cloneVoice: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
      isAvailable: vi.fn().mockResolvedValue(true),
    };
    logger = { error: vi.fn(), log: vi.fn() };
    notifications = { publishAssetStatus: vi.fn() };
    shared = {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: ingredientId },
      }),
    };
    credits = { settleElevenLabsCloneCredits: vi.fn() };
    voices = {
      findOne: vi.fn().mockResolvedValue({ id: ingredientId }),
      patchAll: vi.fn(),
    };
    service = new VoiceCloneService(
      byok as unknown as ByokService,
      elevenLabs as unknown as ElevenLabsService,
      managedInferenceRuntime as unknown as ManagedInferenceRuntimeService,
      logger as unknown as LoggerService,
      notifications as unknown as NotificationsPublisherService,
      shared as unknown as SharedService,
      credits as unknown as VoiceCreditsService,
      voices as unknown as VoicesService,
    );
  });

  it('requires a file or audioUrl before selecting a provider', async () => {
    await expect(
      service.clone(user, { name: 'Clone' }, undefined, request),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(credits.settleElevenLabsCloneCredits).not.toHaveBeenCalled();
  });

  it('clones synchronously with ElevenLabs and settles the flat charge', async () => {
    const file = { buffer: Buffer.from('audio') } as Express.Multer.File;

    await expect(
      service.clone(user, { name: 'Clone' }, file, request),
    ).resolves.toMatchObject({ id: ingredientId });
    expect(credits.settleElevenLabsCloneCredits).toHaveBeenCalledWith(
      request,
      organizationId,
    );
    expect(elevenLabs.cloneVoice).toHaveBeenCalledWith(
      'Clone',
      [file.buffer],
      { description: undefined, removeBackgroundNoise: true },
      'key',
    );
    expect(voices.patchAll).toHaveBeenCalledWith(
      { id: ingredientId },
      expect.objectContaining({
        cloneStatus: VoiceCloneStatus.READY,
        externalVoiceId: 'external-voice-1',
        voiceProvider: VoiceProvider.ELEVENLABS,
      }),
    );
    expect(notifications.publishAssetStatus).toHaveBeenCalledWith(
      ingredientId,
      VoiceCloneStatus.READY,
      userId,
      expect.objectContaining({ provider: VoiceProvider.ELEVENLABS }),
    );
  });

  it('accepts an asynchronous Fleet clone without settling controller credits', async () => {
    await expect(
      service.clone(
        user,
        {
          audioUrl: 'https://example.com/audio.mp3',
          name: 'Clone',
          provider: VoiceProvider.GENFEED_AI,
        },
        undefined,
        request,
      ),
    ).resolves.toMatchObject({ id: ingredientId });
    expect(credits.settleElevenLabsCloneCredits).not.toHaveBeenCalled();
    expect(managedInferenceRuntime.cloneVoice).toHaveBeenCalledWith({
      audioUrl: 'https://example.com/audio.mp3',
      handle: ingredientId,
      label: 'Clone',
    });
    expect(voices.patchAll).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      {
        providerData: { fleet: { jobId: 'job-1', jobKind: 'voice-clone' } },
      },
    );
  });

  it('marks an ingredient failed when Fleet rejects the clone job', async () => {
    managedInferenceRuntime.cloneVoice.mockResolvedValue(null);

    await expect(
      service.clone(
        user,
        {
          audioUrl: 'https://example.com/audio.mp3',
          name: 'Clone',
          provider: VoiceProvider.GENFEED_AI,
        },
        undefined,
        request,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
    expect(voices.patchAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ organizationId }),
      {
        cloneStatus: VoiceCloneStatus.FAILED,
        status: IngredientStatus.FAILED,
      },
    );
  });

  it('tenant-scopes deletion and soft-deletes by the canonical voice id', async () => {
    voices.findOne.mockResolvedValue({
      externalVoiceId: 'external-voice-1',
      id: 'canonical-voice-1',
      voiceProvider: VoiceProvider.ELEVENLABS,
    });

    await service.deleteClonedVoice(user, ingredientId);

    expect(voices.findOne).toHaveBeenCalledWith({
      id: ingredientId,
      category: 'VOICE',
      isCloned: true,
      isDeleted: false,
      organizationId,
    });
    expect(elevenLabs.deleteVoice).toHaveBeenCalledWith(
      'external-voice-1',
      'key',
    );
    expect(voices.patchAll).toHaveBeenCalledWith(
      { id: 'canonical-voice-1' },
      { isDeleted: true },
    );
  });
});
