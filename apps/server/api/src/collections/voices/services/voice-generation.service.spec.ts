import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { AGENT_RUNTIME_ACTION_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import type { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { ElevenLabsError } from '@elevenlabs/elevenlabs-js';
import { getActionDefinition } from '@genfeedai/actions';
import {
  ActivityKey,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { compileActionContract } from '@genfeedai/workflows/engine';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

describe('VoiceGenerationService', () => {
  const ingredientId = testId('ingredient');
  const organizationId = testId('org');
  const brandId = testId('brand');
  const userId = testId('user');
  const user = {
    id: 'auth-user-1',
    brandId,
    organizationId: organizationId,
    userId,
  } as User;
  const platformBinding = {
    credentialVersionId: 'platform',
    kind: 'platform' as const,
    organizationId,
    provider: 'elevenlabs' as const,
  };
  const personalBinding = {
    credentialVersionId: 'credential-v1',
    kind: 'byok' as const,
    organizationId,
    provider: 'elevenlabs' as const,
  };
  const receipt = (
    binding: typeof platformBinding | typeof personalBinding,
    state: 'accepted' | 'submitted' | 'completed' = 'accepted',
  ) => ({
    connection: binding,
    organizationId,
    provider: 'elevenlabs',
    state,
    version: 1,
    voice: { externalVoiceId: 'voice-1' },
  });
  let accountVoices: { resolveSpeechVoice: ReturnType<typeof vi.fn> };
  let connections: { resolve: ReturnType<typeof vi.fn> };
  let elevenLabs: { generateAndUploadAudio: ReturnType<typeof vi.fn> };
  let logger: { error: ReturnType<typeof vi.fn> };
  let shared: { createMediaDocuments: ReturnType<typeof vi.fn> };
  let credits: {
    assertOrganizationCanAfford: ReturnType<typeof vi.fn>;
    settleBackgroundGenerationCredits: ReturnType<typeof vi.fn>;
  };
  let voices: {
    findOne: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
    prisma: { ingredient: { updateMany: ReturnType<typeof vi.fn> } };
  };
  let workflowRunner: {
    enqueueWorkflow: ReturnType<typeof vi.fn>;
    registerAction: ReturnType<typeof vi.fn>;
  };
  // One mock stands in for the activity lookup and the recording API.
  let activities: {
    findOne: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let notifications: { publishBackgroundTaskUpdate: ReturnType<typeof vi.fn> };
  let service: VoiceGenerationService;

  beforeEach(() => {
    accountVoices = {
      resolveSpeechVoice: vi.fn().mockResolvedValue({
        connectionKind: 'platform',
        externalVoiceId: 'voice-1',
      }),
    };
    connections = {
      resolve: vi.fn(async (_organizationId: string, kind: string) =>
        kind === 'byok'
          ? { apiKey: 'personal-key', binding: personalBinding }
          : { apiKey: 'platform-key', binding: platformBinding },
      ),
    };
    elevenLabs = {
      generateAndUploadAudio: vi.fn().mockResolvedValue({
        audioUrl: 'https://example.com/generated.mp3',
        duration: 90,
        uploadResult: {
          publicUrl: 'https://example.com/generated.mp3',
          s3Key: 'ingredients/musics/voice-1',
        },
      }),
    };
    logger = { error: vi.fn() };
    shared = {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: ingredientId },
      }),
    };
    credits = {
      assertOrganizationCanAfford: vi.fn(),
      settleBackgroundGenerationCredits: vi.fn(),
    };
    voices = {
      findOne: vi.fn().mockResolvedValue({
        id: ingredientId,
        status: IngredientStatus.GENERATED,
      }),
      patchAll: vi.fn(),
      prisma: {
        ingredient: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      },
    };
    workflowRunner = {
      enqueueWorkflow: vi.fn(),
      registerAction: vi.fn(),
    };
    activities = {
      findOne: vi.fn().mockResolvedValue(null),
      record: vi.fn().mockResolvedValue({ id: 'voice-activity' }),
      update: vi.fn().mockResolvedValue({ id: 'voice-activity' }),
    };
    notifications = { publishBackgroundTaskUpdate: vi.fn() };
    service = new VoiceGenerationService(
      accountVoices as unknown as ElevenLabsAccountVoicesService,
      connections as unknown as ElevenLabsConnectionService,
      elevenLabs as unknown as ElevenLabsService,
      logger as unknown as LoggerService,
      shared as unknown as SharedService,
      credits as unknown as VoiceCreditsService,
      voices as unknown as VoicesService,
      workflowRunner as never,
      activities as never,
      activities as never,
      notifications as never,
    );
  });

  it('persists a scoped voice activity and emits its durable result ID', async () => {
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      brandId,
      status: IngredientStatus.PROCESSING,
    });
    await service.generate(user, { text: 'Hello', voiceId: 'voice-1' });
    expect(activities.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: ingredientId,
        organizationId,
        userId,
        brandId,
        key: ActivityKey.VOICE_PROCESSING,
      }),
    );
    activities.findOne.mockResolvedValue({ id: 'voice-activity' });
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      brandId,
      cdnUrl: 'https://example.com/voice.mp3',
      status: IngredientStatus.GENERATED,
    });
    await service.executeQueuedGeneration({
      ingredientId,
      organizationId,
      userId,
      text: 'Hello',
      voiceId: 'voice-1',
    });
    expect(activities.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'voice-activity' }),
      expect.objectContaining({
        key: ActivityKey.VOICE_GENERATED,
        entityId: ingredientId,
      }),
    );
    expect(notifications.publishBackgroundTaskUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        taskId: ingredientId,
        resultId: ingredientId,
        userId,
        status: 'completed',
      }),
    );
  });

  it('registers the queued voice executor during module initialization', async () => {
    const params = {
      ingredientId,
      organizationId,
      text: 'Hello',
      userId,
      voiceId: 'voice-1',
    };
    const result = {
      id: ingredientId,
      status: IngredientStatus.GENERATED,
    };
    const executeQueuedGeneration = vi
      .spyOn(service, 'executeQueuedGeneration')
      .mockResolvedValue(result);

    service.onModuleInit();

    expect(workflowRunner.registerAction).toHaveBeenCalledWith(
      AGENT_RUNTIME_ACTION_IDS.VOICE_GENERATION,
      expect.any(Function),
    );
    const execute = workflowRunner.registerAction.mock.calls[0]?.[1] as
      | ((request: { input: Record<string, unknown> }) => Promise<unknown>)
      | undefined;
    await expect(execute?.({ input: params })).resolves.toEqual(result);
    expect(executeQueuedGeneration).toHaveBeenCalledWith(params);
  });

  it.each([
    [{ text: '', voiceId: 'voice-1' }, 'Text is required'],
    [{ text: 'Hello', voiceId: '' }, 'voiceId is required'],
  ])(
    'validates required generation input before spending',
    async (dto, detail) => {
      await expect(service.generate(user, dto)).rejects.toMatchObject({
        response: { detail },
        status: HttpStatus.BAD_REQUEST,
      });
      expect(shared.createMediaDocuments).not.toHaveBeenCalled();
    },
  );

  it('reserves credits, persists the placeholder, and enqueues the workflow', async () => {
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    const result = await service.generate(user, {
      text: 'Hello',
      voiceId: 'voice-1',
    });

    expect(credits.assertOrganizationCanAfford).toHaveBeenCalledWith(
      organizationId,
      1,
    );
    expect(shared.createMediaDocuments).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        brandId,
        category: IngredientCategory.VOICE,
        organizationId,
        status: IngredientStatus.PROCESSING,
        voiceSource: 'generated',
      }),
    );
    // Rendering is workflow-backed: `generate` never calls the provider inline.
    expect(elevenLabs.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(workflowRunner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'voice.generate',
        inputValues: {
          ingredientId,
          organizationId,
          text: 'Hello',
          userId,
          voiceId: 'voice-1',
        },
        organizationId,
        userId,
      }),
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      }),
    );
    expect(result).toMatchObject({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });
  });

  it('pins the selected skill version onto the voice job before enqueue', async () => {
    const skillRuntime = {
      collectAuthorizedPins: vi.fn().mockResolvedValue([
        {
          contentHash: 'hash-v1',
          instructions: 'version one',
          slug: 'narration',
          versionId: 'sv-1',
        },
      ]),
    };
    const pinned = new VoiceGenerationService(
      accountVoices as unknown as ElevenLabsAccountVoicesService,
      connections as unknown as ElevenLabsConnectionService,
      elevenLabs as unknown as ElevenLabsService,
      logger as unknown as LoggerService,
      shared as unknown as SharedService,
      credits as unknown as VoiceCreditsService,
      voices as unknown as VoicesService,
      workflowRunner as never,
      activities as never,
      activities as never,
      notifications as never,
      skillRuntime as never,
    );
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    await pinned.generate(user, {
      requestedSkillSlugs: ['narration'],
      text: 'Hello',
      voiceId: 'voice-1',
    });

    expect(skillRuntime.collectAuthorizedPins).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        modality: 'audio',
        requestedSkillSlugs: ['narration'],
      }),
    );
    expect(workflowRunner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: expect.objectContaining({
          brandId,
          pinnedSkills: [expect.objectContaining({ versionId: 'sv-1' })],
          requestedSkillSlugs: ['narration'],
        }),
      }),
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      }),
    );

    // The converter copies each input value onto the action node, so the
    // skill-pinned job must pass the closed action contract.
    const [{ inputValues }] = workflowRunner.enqueueWorkflow.mock.calls[0];
    const action = getActionDefinition(
      AGENT_RUNTIME_ACTION_IDS.VOICE_GENERATION,
    );
    const contract = compileActionContract(
      AGENT_RUNTIME_ACTION_IDS.VOICE_GENERATION,
      {
        inputSchema: (action?.inputSchema ?? {}) as Readonly<
          Record<string, unknown>
        >,
        outputSchema: (action?.outputSchema ?? {}) as Readonly<
          Record<string, unknown>
        >,
      },
    );
    expect(() =>
      contract.validateInput(inputValues, {
        nodeId: 'execute',
        runId: 'run',
        workflowId: 'voice.generate',
        workflowVersionId: 'v1',
      }),
    ).not.toThrow();
  });

  it('re-reserves background work for an idempotent source-action retry', async () => {
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    const result = await service.generate(user, {
      sourceActionId: 'voice-card-1',
      text: 'Hello',
      voiceId: 'voice-1',
    });

    expect(result).toMatchObject({ id: ingredientId });
    expect(shared.createMediaDocuments).not.toHaveBeenCalled();
    expect(voices.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        category: IngredientCategory.VOICE,
        organizationId,
        sourceActionId: 'voice-card-1',
      }),
      expect.any(Array),
    );
    expect(workflowRunner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        inputValues: {
          ingredientId,
          organizationId,
          text: 'Hello',
          userId,
          voiceId: 'voice-1',
        },
      }),
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      }),
    );
  });

  it('renders, settles, and returns the generated voice from the queued action', async () => {
    voices.findOne
      .mockResolvedValueOnce({
        id: ingredientId,
        status: IngredientStatus.PROCESSING,
      })
      .mockResolvedValue({
        cdnUrl: 'https://example.com/generated.mp3',
        duration: 90,
        id: ingredientId,
        status: IngredientStatus.GENERATED,
      });

    const result = await service.executeQueuedGeneration({
      ingredientId,
      organizationId,
      text: 'Hello',
      userId,
      voiceId: 'voice-1',
    });

    expect(elevenLabs.generateAndUploadAudio).toHaveBeenCalledWith(
      'voice-1',
      'Hello',
      ingredientId,
      organizationId,
      userId,
      'platform-key',
    );
    expect(voices.patchAll).toHaveBeenCalledWith(
      { id: ingredientId, isDeleted: false, organizationId },
      expect.objectContaining({
        duration: 90,
        generationProvider: receipt(platformBinding, 'completed'),
        s3Key: 'ingredients/musics/voice-1',
        status: IngredientStatus.GENERATED,
      }),
    );
    expect(credits.settleBackgroundGenerationCredits).toHaveBeenCalledWith({
      durationSeconds: 90,
      ingredientId,
      organizationId,
      userId,
    });
    expect(result).toMatchObject({ id: ingredientId });
  });

  it('preserves typed HTTP failures from deferred settlement', async () => {
    voices.findOne
      .mockResolvedValueOnce({
        id: ingredientId,
        status: IngredientStatus.PROCESSING,
      })
      .mockResolvedValue({
        cdnUrl: 'https://example.com/generated.mp3',
        duration: 90,
        id: ingredientId,
        status: IngredientStatus.GENERATED,
      });
    credits.settleBackgroundGenerationCredits.mockRejectedValue(
      new HttpException(
        { detail: 'Insufficient credits' },
        HttpStatus.PAYMENT_REQUIRED,
      ),
    );

    await expect(
      service.executeQueuedGeneration({
        ingredientId,
        organizationId,
        text: 'Hello',
        userId,
        voiceId: 'voice-1',
      }),
    ).rejects.toMatchObject({
      response: { detail: 'Insufficient credits' },
      status: HttpStatus.PAYMENT_REQUIRED,
    });
    // Settlement runs after the asset is persisted, so the ingredient stays
    // GENERATED rather than being rolled back to FAILED.
    expect(voices.patchAll).toHaveBeenCalledWith(
      { id: ingredientId, isDeleted: false, organizationId },
      expect.objectContaining({ status: IngredientStatus.GENERATED }),
    );
  });

  it('marks the ingredient failed when rendering fails', async () => {
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });
    elevenLabs.generateAndUploadAudio.mockRejectedValue(
      new Error('provider unavailable'),
    );

    await expect(
      service.executeQueuedGeneration({
        ingredientId,
        organizationId,
        text: 'Hello',
        userId,
        voiceId: 'voice-1',
      }),
    ).rejects.toMatchObject({
      response: { detail: 'provider unavailable' },
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    expect(voices.patchAll).toHaveBeenLastCalledWith(
      { id: ingredientId, isDeleted: false, organizationId, s3Key: null },
      { status: IngredientStatus.FAILED },
    );
    expect(activities.record).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ActivityKey.VOICE_FAILED,
        organizationId,
        userId,
        entityId: ingredientId,
      }),
    );
  });

  it('reconciles a persisted voice before retrying provider work and settles once by asset identity', async () => {
    voices.findOne.mockResolvedValue({
      cdnUrl: 'https://example.com/generated.mp3',
      duration: 90,
      id: ingredientId,
      status: IngredientStatus.GENERATED,
    });

    const result = await service.executeQueuedGeneration({
      ingredientId,
      organizationId,
      text: 'Hello',
      userId,
      voiceId: 'voice-1',
    });

    expect(result).toMatchObject({ id: ingredientId });
    expect(elevenLabs.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(credits.settleBackgroundGenerationCredits).toHaveBeenCalledWith({
      durationSeconds: 90,
      ingredientId,
      organizationId,
      userId,
    });
  });
  it('binds a personal voice to the owning connection at submission', async () => {
    accountVoices.resolveSpeechVoice.mockResolvedValue({
      connectionKind: 'byok',
      externalVoiceId: 'voice-1',
      internalVoiceId: 'saved-voice-1',
    });
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    await service.generate(user, { text: 'Hello', voiceId: 'saved-voice-1' });

    expect(accountVoices.resolveSpeechVoice).toHaveBeenCalledWith(
      organizationId,
      'saved-voice-1',
    );
    expect(voices.patchAll).toHaveBeenCalledWith(
      { id: ingredientId, organizationId },
      {
        generationProvider: {
          ...receipt(personalBinding),
          voice: {
            externalVoiceId: 'voice-1',
            internalVoiceId: 'saved-voice-1',
          },
        },
      },
    );
    // The connected account pays ElevenLabs, not platform credits.
    expect(credits.assertOrganizationCanAfford).not.toHaveBeenCalled();
  });

  it('rejects a voice it cannot bind before creating any asset', async () => {
    accountVoices.resolveSpeechVoice.mockRejectedValue(
      new BadRequestException('Import it first.'),
    );

    await expect(
      service.generate(user, { text: 'Hello', voiceId: 'unknown-voice' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(shared.createMediaDocuments).not.toHaveBeenCalled();
    expect(workflowRunner.enqueueWorkflow).not.toHaveBeenCalled();
  });

  it('fails without switching accounts when the personal connection is gone', async () => {
    accountVoices.resolveSpeechVoice.mockResolvedValue({
      connectionKind: 'byok',
      externalVoiceId: 'voice-1',
    });
    connections.resolve.mockRejectedValue(
      new BadRequestException(
        'Reconnect your ElevenLabs account to use this voice.',
      ),
    );

    await expect(
      service.generate(user, { text: 'Hello', voiceId: 'voice-1' }),
    ).rejects.toThrow('Reconnect your ElevenLabs account');
    expect(connections.resolve).not.toHaveBeenCalledWith(
      organizationId,
      'platform',
    );
    expect(shared.createMediaDocuments).not.toHaveBeenCalled();
  });

  it('speaks through the bound personal key and skips platform credits', async () => {
    voices.findOne
      .mockResolvedValueOnce({
        generationProvider: receipt(personalBinding),
        id: ingredientId,
        status: IngredientStatus.PROCESSING,
      })
      .mockResolvedValue({
        cdnUrl: 'https://example.com/generated.mp3',
        id: ingredientId,
        status: IngredientStatus.GENERATED,
      });

    await service.executeQueuedGeneration({
      ingredientId,
      organizationId,
      text: 'Hello',
      userId,
      voiceId: 'voice-1',
    });

    expect(voices.prisma.ingredient.updateMany).toHaveBeenCalledWith({
      data: { generationProvider: receipt(personalBinding, 'submitted') },
      where: {
        generationProvider: { equals: 'accepted', path: ['state'] },
        id: ingredientId,
        isDeleted: false,
        organizationId,
      },
    });
    expect(elevenLabs.generateAndUploadAudio).toHaveBeenCalledWith(
      'voice-1',
      'Hello',
      ingredientId,
      organizationId,
      userId,
      'personal-key',
    );
    expect(accountVoices.resolveSpeechVoice).not.toHaveBeenCalled();
    expect(credits.settleBackgroundGenerationCredits).not.toHaveBeenCalled();
  });

  it('refuses a request whose personal connection changed after submission', async () => {
    voices.findOne.mockResolvedValue({
      generationProvider: receipt({
        ...personalBinding,
        credentialVersionId: 'credential-v0',
      }),
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    await expect(
      service.executeQueuedGeneration({
        ingredientId,
        organizationId,
        text: 'Hello',
        userId,
        voiceId: 'voice-1',
      }),
    ).rejects.toThrow('The ElevenLabs connection changed');
    expect(elevenLabs.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(voices.prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it('does not resend a submitted request whose result is unknown', async () => {
    voices.findOne.mockResolvedValue({
      generationProvider: receipt(platformBinding, 'submitted'),
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });
    voices.prisma.ingredient.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.executeQueuedGeneration({
        ingredientId,
        organizationId,
        text: 'Hello',
        userId,
        voiceId: 'voice-1',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(elevenLabs.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(voices.patchAll).toHaveBeenLastCalledWith(
      { id: ingredientId, isDeleted: false, organizationId, s3Key: null },
      { status: IngredientStatus.FAILED },
    );
    expect(credits.settleBackgroundGenerationCredits).not.toHaveBeenCalled();
  });

  it('turns an inaccessible provider voice into an actionable failure', async () => {
    voices.findOne.mockResolvedValue({
      generationProvider: receipt(personalBinding),
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });
    elevenLabs.generateAndUploadAudio.mockRejectedValue(
      new ElevenLabsError({
        body: { detail: { status: 'voice_not_found' } },
        message: 'Not found',
        statusCode: 404,
      }),
    );

    await expect(
      service.executeQueuedGeneration({
        ingredientId,
        organizationId,
        text: 'Hello',
        userId,
        voiceId: 'voice-1',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('not available in the connected'),
      status: HttpStatus.BAD_REQUEST,
    });
    expect(connections.resolve).not.toHaveBeenCalledWith(
      organizationId,
      'platform',
    );
  });
});
