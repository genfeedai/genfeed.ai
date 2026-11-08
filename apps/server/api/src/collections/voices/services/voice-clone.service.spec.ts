import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import type { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import type { HeyGenClonedVoice } from '@api/services/integrations/heygen/helpers/heygen-twin';
import type { HeyGenTwinService } from '@api/services/integrations/heygen/services/heygen-twin.service';
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

/**
 * A HeyGen account double: clones move from pending to the configured
 * outcome after the given number of reads, and deletes remove them.
 */
class FakeHeyGenVoices {
  voices = new Map<string, HeyGenClonedVoice>();
  outcome: HeyGenClonedVoice['status'] = 'active';
  failureReason: string | null = null;
  pendingReads = 1;
  isConnected = true;
  private reads = 0;

  async cloneVoice(organizationId: string, sample: { name: string }) {
    if (!this.isConnected)
      throw new BadRequestException(
        'Reconnect your personal HeyGen account to use this identity.',
      );
    const voiceId = `hg-voice-${this.voices.size + 1}`;
    this.voices.set(voiceId, {
      failureReason: null,
      previewAudioUrl: null,
      status: 'pending',
      voiceId,
    });
    return {
      connection: {
        credentialVersionId: 'heygen-v1',
        kind: 'byok' as const,
        organizationId,
        provider: 'heygen' as const,
      },
      name: sample.name,
      voiceId,
    };
  }

  async getVoice(_organizationId: string, voiceId: string) {
    const voice = this.voices.get(voiceId);
    if (!voice) throw new Error('voice_not_found');
    this.reads += 1;
    if (this.reads > this.pendingReads)
      this.voices.set(voiceId, {
        ...voice,
        failureReason: this.failureReason,
        previewAudioUrl:
          this.outcome === 'active'
            ? `https://resource.heygen.ai/voices/${voiceId}.mp3`
            : null,
        status: this.outcome,
      });
    return this.voices.get(voiceId) as HeyGenClonedVoice;
  }

  async deleteVoice(_organizationId: string, voiceId: string) {
    this.voices.delete(voiceId);
  }
}

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
  let request: Request;
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
  let credits: VoiceCreditsService;
  let voices: {
    findOne: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
  };
  let heyGen: FakeHeyGenVoices;
  let service: VoiceCloneService;

  beforeEach(() => {
    vi.useRealTimers();
    heyGen = new FakeHeyGenVoices();
    request = {
      creditsConfig: { deferred: true, description: 'Voice cloning' },
    } as unknown as Request;
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
    credits = new VoiceCreditsService({} as never, {} as never);
    voices = {
      findOne: vi.fn().mockResolvedValue({ id: ingredientId }),
      patchAll: vi.fn(),
    };
    service = new VoiceCloneService(
      connections as unknown as ElevenLabsConnectionService,
      elevenLabs as unknown as ElevenLabsService,
      heyGen as unknown as HeyGenTwinService,
      managedInferenceRuntime as unknown as ManagedInferenceRuntimeService,
      logger as unknown as LoggerService,
      notifications as unknown as NotificationsPublisherService,
      shared as unknown as SharedService,
      credits,
      voices as unknown as VoicesService,
    );
  });

  it('requires a file or audioUrl before selecting a provider', async () => {
    await expect(
      service.clone(user, { name: 'Clone' }, undefined, request),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(request).toMatchObject({ creditsConfig: { deferred: true } });
  });

  it('clones on the personal ElevenLabs account and charges no platform credits', async () => {
    const file = { buffer: Buffer.from('audio') } as Express.Multer.File;

    await expect(
      service.clone(user, { name: 'Clone' }, file, request),
    ).resolves.toMatchObject({ id: ingredientId });
    expect(request).toMatchObject({
      creditsConfig: { amount: 0, deferred: false },
    });
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
    expect(request).toMatchObject({ creditsConfig: { deferred: true } });
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
  it('refuses to clone without a personal ElevenLabs account and creates nothing', async () => {
    connections.findPersonalConnection.mockResolvedValue(undefined);
    const file = { buffer: Buffer.from('audio') } as Express.Multer.File;

    await expect(
      service.clone(user, { name: 'Clone' }, file, request),
    ).rejects.toMatchObject({
      response: { title: 'ElevenLabs account required' },
      status: HttpStatus.BAD_REQUEST,
    });
    expect(elevenLabs.cloneVoice).not.toHaveBeenCalled();
    expect(shared.createMediaDocuments).not.toHaveBeenCalled();
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
  describe('on the person’s own HeyGen account', () => {
    const wav = {
      buffer: Buffer.from('RIFF....WAVE'),
      mimetype: 'audio/wav',
    } as Express.Multer.File;

    it('saves the voice once HeyGen reports it active, with no platform charge', async () => {
      voices.findOne.mockImplementation(async () => ({
        id: ingredientId,
        ...voices.patchAll.mock.calls.at(-1)?.[1],
      }));

      const voice = await service.clone(
        user,
        { name: 'My studio voice', provider: VoiceProvider.HEYGEN },
        wav,
        request,
      );

      expect(voice).toMatchObject({
        cloneStatus: VoiceCloneStatus.READY,
        externalVoiceId: 'hg-voice-1',
        isCloned: true,
        providerData: {
          heygen: { connection: { kind: 'byok', provider: 'heygen' } },
        },
        sampleAudioUrl: 'https://resource.heygen.ai/voices/hg-voice-1.mp3',
        voiceProvider: VoiceProvider.HEYGEN,
      });
      expect(request).toMatchObject({
        creditsConfig: { amount: 0, deferred: false },
      });
      expect([...heyGen.voices.keys()]).toEqual(['hg-voice-1']);
    });

    it('removes the HeyGen voice when it cannot be saved here', async () => {
      voices.patchAll.mockRejectedValue(new Error('database unavailable'));

      await expect(
        service.clone(
          user,
          { name: 'Voice', provider: VoiceProvider.HEYGEN },
          wav,
          request,
        ),
      ).rejects.toMatchObject({
        response: { detail: 'database unavailable' },
      });
      expect(heyGen.voices.size).toBe(0);
    });

    it('returns the saved voice when the live status update fails', async () => {
      notifications.publishAssetStatus.mockRejectedValue(
        new Error('socket down'),
      );

      const voice = await service.clone(
        user,
        { name: 'Voice', provider: VoiceProvider.HEYGEN },
        wav,
        request,
      );

      expect(voice).toMatchObject({ id: ingredientId });
      expect([...heyGen.voices.keys()]).toEqual(['hg-voice-1']);
    });

    it('asks to connect HeyGen when there is no personal key', async () => {
      heyGen.isConnected = false;

      await expect(
        service.clone(
          user,
          { name: 'Voice', provider: VoiceProvider.HEYGEN },
          wav,
          request,
        ),
      ).rejects.toMatchObject({
        response: {
          detail: expect.stringContaining('Connect your HeyGen account'),
          title: 'HeyGen account required',
        },
        status: HttpStatus.BAD_REQUEST,
      });
      expect(heyGen.voices.size).toBe(0);
      expect(request).toMatchObject({ creditsConfig: { deferred: true } });
    });

    it('explains a rejected sample and removes the failed voice', async () => {
      heyGen.outcome = 'failed';
      heyGen.failureReason = 'INVALID_AUDIO';

      await expect(
        service.clone(
          user,
          { name: 'Voice', provider: VoiceProvider.HEYGEN },
          wav,
          request,
        ),
      ).rejects.toMatchObject({
        response: {
          detail: expect.stringContaining('Record at least a minute'),
        },
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
      expect(heyGen.voices.size).toBe(0);
      expect(shared.createMediaDocuments).not.toHaveBeenCalled();
    });

    it('needs a recorded sample', async () => {
      await expect(
        service.clone(
          user,
          {
            audioUrl: 'https://cdn.example.com/a.wav',
            name: 'Voice',
            provider: VoiceProvider.HEYGEN,
          },
          undefined,
          request,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(heyGen.voices.size).toBe(0);
    });

    it('deletes a HeyGen clone from the person’s account', async () => {
      heyGen.voices.set('hg-voice-9', {
        failureReason: null,
        previewAudioUrl: null,
        status: 'active',
        voiceId: 'hg-voice-9',
      });
      voices.findOne.mockResolvedValue({
        externalVoiceId: 'hg-voice-9',
        id: ingredientId,
        voiceProvider: VoiceProvider.HEYGEN,
      });

      await service.deleteClonedVoice(user, ingredientId);

      expect(heyGen.voices.size).toBe(0);
    });
  });
});
