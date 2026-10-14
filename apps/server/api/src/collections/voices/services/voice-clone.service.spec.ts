import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import type { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { ElevenLabsError } from '@elevenlabs/elevenlabs-js';
import {
  IngredientStatus,
  VoiceCloneStatus,
  VoiceProvider,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, HttpStatus } from '@nestjs/common';
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
  const personalBinding = {
    credentialVersionId: 'credential-v1',
    kind: 'byok' as const,
    organizationId,
    provider: 'elevenlabs' as const,
  };
  const platformBinding = {
    ...personalBinding,
    credentialVersionId: 'platform',
    kind: 'platform' as const,
  };
  let connections: {
    findPersonalConnection: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
  };
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
    connections = {
      findPersonalConnection: vi
        .fn()
        .mockResolvedValue({ apiKey: 'key', binding: personalBinding }),
      resolve: vi.fn(async (_organizationId: string, kind: string) =>
        kind === 'byok'
          ? { apiKey: 'key', binding: personalBinding }
          : { apiKey: 'platform-key', binding: platformBinding },
      ),
    };
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
      connections as unknown as ElevenLabsConnectionService,
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
        providerData: {
          elevenlabs: {
            category: 'cloned',
            connection: personalBinding,
            version: 1,
          },
        },
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
  it('clones on the platform account when no personal connection exists', async () => {
    connections.findPersonalConnection.mockResolvedValue(undefined);
    const file = { buffer: Buffer.from('audio') } as Express.Multer.File;

    await service.clone(user, { name: 'Clone' }, file, request);

    expect(elevenLabs.cloneVoice).toHaveBeenCalledWith(
      'Clone',
      [file.buffer],
      expect.any(Object),
      'platform-key',
    );
    expect(voices.patchAll).toHaveBeenCalledWith(
      { id: ingredientId },
      expect.objectContaining({
        providerData: {
          elevenlabs: {
            category: 'cloned',
            connection: platformBinding,
            version: 1,
          },
        },
      }),
    );
  });

  it('deletes a bound clone through its own account, never the platform', async () => {
    voices.findOne.mockResolvedValue({
      externalVoiceId: 'external-voice-1',
      id: 'canonical-voice-1',
      providerData: {
        elevenlabs: {
          category: 'cloned',
          connection: personalBinding,
          version: 1,
        },
      },
      voiceProvider: VoiceProvider.ELEVENLABS,
    });
    connections.resolve.mockRejectedValue(
      new BadRequestException(
        'Reconnect your ElevenLabs account to use this voice.',
      ),
    );

    await expect(
      service.deleteClonedVoice(user, ingredientId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(connections.resolve).toHaveBeenCalledWith(organizationId, 'byok');
    expect(elevenLabs.deleteVoice).not.toHaveBeenCalled();
    expect(voices.patchAll).not.toHaveBeenCalled();
  });

  it('removes the local clone when ElevenLabs already deleted the voice', async () => {
    voices.findOne.mockResolvedValue({
      externalVoiceId: 'external-voice-1',
      id: 'canonical-voice-1',
      voiceProvider: VoiceProvider.ELEVENLABS,
    });
    elevenLabs.deleteVoice.mockRejectedValue(
      new ElevenLabsError({ message: 'Not found', statusCode: 404 }),
    );

    await service.deleteClonedVoice(user, ingredientId);

    expect(voices.patchAll).toHaveBeenCalledWith(
      { id: 'canonical-voice-1' },
      { isDeleted: true },
    );
  });
});
