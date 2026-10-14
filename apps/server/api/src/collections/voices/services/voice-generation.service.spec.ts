import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { AGENT_RUNTIME_ACTION_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import type { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenSpeechVoicesService } from '@api/services/integrations/heygen/services/heygen-speech-voices.service';
import { RouterService } from '@api/services/router/router.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { ElevenLabsError } from '@elevenlabs/elevenlabs-js';
import { getActionDefinition } from '@genfeedai/actions';
import {
  ActivityKey,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
  RouterPriority,
  VoiceProvider,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { compileActionContract } from '@genfeedai/workflows/engine';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';

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
  const elevenLabsModel = MODEL_KEYS.ELEVENLABS_V4;
  const platformConnection = {
    apiKey: 'platform-key',
    binding: { kind: 'platform', organizationId, provider: 'heygen' },
  };
  const byokConnection = {
    apiKey: 'workspace-key',
    binding: {
      credentialVersionId: 'cred-1',
      kind: 'byok',
      organizationId,
      provider: 'heygen',
    },
  };
  const elevenLabsPlatformBinding = {
    credentialVersionId: 'platform',
    kind: 'platform' as const,
    organizationId,
    provider: 'elevenlabs' as const,
  };
  const elevenLabsPersonalBinding = {
    credentialVersionId: 'credential-v1',
    kind: 'byok' as const,
    organizationId,
    provider: 'elevenlabs' as const,
  };
  const speechReceipt = (
    binding:
      | typeof elevenLabsPlatformBinding
      | typeof elevenLabsPersonalBinding,
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
  let heygen: {
    generateSpeech: ReturnType<typeof vi.fn>;
    resolveSpeechConnection: ReturnType<typeof vi.fn>;
  };
  let files: { uploadToS3: ReturnType<typeof vi.fn> };
  let router: { selectModel: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let shared: { createMediaDocuments: ReturnType<typeof vi.fn> };
  let credits: {
    assertOrganizationCanAfford: ReturnType<typeof vi.fn>;
    quoteSpeech: ReturnType<typeof vi.fn>;
    settleSpeechCredits: ReturnType<typeof vi.fn>;
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

  function build(skillRuntime?: unknown): VoiceGenerationService {
    return new VoiceGenerationService(
      accountVoices as unknown as ElevenLabsAccountVoicesService,
      connections as unknown as ElevenLabsConnectionService,
      elevenLabs as unknown as ElevenLabsService,
      heygen as unknown as HeyGenService,
      heygen as unknown as HeyGenSpeechVoicesService,
      files as unknown as FilesClientService,
      router as unknown as RouterService,
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
  }

  function queued(overrides: Record<string, unknown> = {}) {
    return {
      ingredientId,
      model: elevenLabsModel,
      organizationId,
      text: 'Hello',
      userId,
      voiceId: 'voice-1',
      ...overrides,
    };
  }

  function processingThenGenerated(): void {
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
  }

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
          ? { apiKey: 'personal-key', binding: elevenLabsPersonalBinding }
          : { apiKey: 'platform-key', binding: elevenLabsPlatformBinding },
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
    heygen = {
      generateSpeech: vi.fn().mockResolvedValue({
        audioUrl: 'https://files.heygen.ai/tts/voice.wav',
        characters: 5,
        duration: 1.5,
      }),
      resolveSpeechConnection: vi.fn().mockResolvedValue(platformConnection),
    };
    files = {
      uploadToS3: vi.fn().mockResolvedValue({
        duration: 1.4,
        publicUrl: 'https://cdn.example.com/voice.wav',
        s3Key: 'stored-voice.wav',
      }),
    };
    router = {
      selectModel: vi
        .fn()
        .mockResolvedValue({ selectedModel: elevenLabsModel }),
    };
    logger = { error: vi.fn(), warn: vi.fn() };
    shared = {
      createMediaDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: ingredientId },
      }),
    };
    credits = {
      assertOrganizationCanAfford: vi.fn(),
      quoteSpeech: vi.fn().mockResolvedValue({
        costSource: 'reviewed-provider',
        credits: 2,
        rateVersion: 'rate-v1',
      }),
      settleSpeechCredits: vi.fn(),
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
    service = build();
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
    await service.executeQueuedGeneration(queued());
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
    const params = queued();
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

  describe('model selection at admission', () => {
    beforeEach(() => {
      voices.findOne.mockResolvedValue({
        id: ingredientId,
        status: IngredientStatus.PROCESSING,
      });
    });

    it('routes Auto among the ElevenLabs speech models for a catalog voice', async () => {
      await service.generate(user, {
        autoSelectModel: true,
        prioritize: RouterPriority.QUALITY,
        text: 'Hello',
        voiceId: 'voice-1',
      });

      expect(router.selectModel).toHaveBeenCalledWith({
        category: ModelCategory.VOICE,
        eligibleModelKeys: [
          MODEL_KEYS.ELEVENLABS_V4,
          MODEL_KEYS.ELEVENLABS_MULTILINGUAL_V2,
          MODEL_KEYS.ELEVENLABS_FLASH_V2_5,
        ],
        organizationId,
        prioritize: RouterPriority.QUALITY,
        prompt: 'Hello',
      });
    });

    it('routes Auto to HeyGen Voice only for a HeyGen Voice voice', async () => {
      router.selectModel.mockResolvedValue({
        selectedModel: MODEL_KEYS.HEYGEN_VOICE,
      });

      await service.generate(user, {
        text: 'Hello',
        voiceId: 'heygen-voice',
        voiceProvider: VoiceProvider.HEYGEN,
      });

      expect(router.selectModel).toHaveBeenCalledWith(
        expect.objectContaining({
          eligibleModelKeys: [MODEL_KEYS.HEYGEN_VOICE],
          prioritize: RouterPriority.BALANCED,
        }),
      );
      expect(shared.createMediaDocuments).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          extension: MetadataExtension.WAV,
          model: MODEL_KEYS.HEYGEN_VOICE,
        }),
      );
    });

    it('validates an explicit model through the router as the only candidate', async () => {
      router.selectModel.mockResolvedValue({
        selectedModel: MODEL_KEYS.ELEVENLABS_FLASH_V2_5,
      });

      await service.generate(user, {
        model: MODEL_KEYS.ELEVENLABS_FLASH_V2_5,
        text: 'Hello',
        voiceId: 'voice-1',
        voiceProvider: VoiceProvider.ELEVENLABS,
      });

      expect(router.selectModel).toHaveBeenCalledWith(
        expect.objectContaining({
          eligibleModelKeys: [MODEL_KEYS.ELEVENLABS_FLASH_V2_5],
        }),
      );
      expect(workflowRunner.enqueueWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          inputValues: expect.objectContaining({
            model: MODEL_KEYS.ELEVENLABS_FLASH_V2_5,
          }),
        }),
        expect.anything(),
      );
    });

    it.each([
      [
        MODEL_KEYS.HEYGEN_VOICE,
        VoiceProvider.ELEVENLABS,
        'cannot speak this voice',
      ],
      [MODEL_KEYS.HEYGEN_AVATAR, VoiceProvider.HEYGEN, 'is not a speech model'],
    ])(
      'refuses %s for a %s voice before routing or spending',
      async (model, voiceProvider, message) => {
        await expect(
          service.generate(user, {
            model,
            text: 'Hello',
            voiceId: 'voice-1',
            voiceProvider,
          }),
        ).rejects.toThrow(message);
        expect(router.selectModel).not.toHaveBeenCalled();
        expect(shared.createMediaDocuments).not.toHaveBeenCalled();
      },
    );

    it('refuses text over the chosen model limit before spending', async () => {
      router.selectModel.mockResolvedValue({
        selectedModel: MODEL_KEYS.HEYGEN_VOICE,
      });

      await expect(
        service.generate(user, {
          text: 'a'.repeat(5_001),
          voiceId: 'heygen-voice',
          voiceProvider: VoiceProvider.HEYGEN,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(credits.quoteSpeech).not.toHaveBeenCalled();
      expect(shared.createMediaDocuments).not.toHaveBeenCalled();
    });

    it('holds the quoted credits for platform-funded speech', async () => {
      credits.quoteSpeech.mockResolvedValue({
        costSource: 'reviewed-provider',
        credits: 27,
        rateVersion: 'rate-v1',
      });
      // Five code points: the emoji is one character, not two UTF-16 units.
      const text = 'Hi 👋!';

      await service.generate(user, { text, voiceId: 'voice-1' });

      expect(credits.quoteSpeech).toHaveBeenCalledWith({
        characters: 5,
        modelKey: elevenLabsModel,
        organizationId,
        provider: 'elevenlabs',
      });
      expect(credits.assertOrganizationCanAfford).toHaveBeenCalledWith(
        organizationId,
        27,
      );
    });

    it('does not hold platform credits for a workspace HeyGen key', async () => {
      router.selectModel.mockResolvedValue({
        selectedModel: MODEL_KEYS.HEYGEN_VOICE,
      });
      heygen.resolveSpeechConnection.mockResolvedValue(byokConnection);

      await service.generate(user, {
        text: 'Hello',
        voiceId: 'my-clone',
        voiceProvider: VoiceProvider.HEYGEN,
      });

      expect(heygen.resolveSpeechConnection).toHaveBeenCalledWith(
        organizationId,
        'my-clone',
      );
      // Still quoted: an unpriced row is refused even when nothing is charged.
      expect(credits.quoteSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'heygen' }),
      );
      expect(credits.assertOrganizationCanAfford).not.toHaveBeenCalled();
    });

    it('refuses before creating anything when the speech quote is unavailable', async () => {
      credits.quoteSpeech.mockRejectedValue(
        new ServiceUnavailableException('Speech pricing is unavailable'),
      );

      await expect(
        service.generate(user, { text: 'Hello', voiceId: 'voice-1' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(shared.createMediaDocuments).not.toHaveBeenCalled();
      expect(workflowRunner.enqueueWorkflow).not.toHaveBeenCalled();
    });
  });

  it('persists the placeholder with its model and enqueues the workflow', async () => {
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    const result = await service.generate(user, {
      text: 'Hello',
      voiceId: 'voice-1',
    });

    expect(shared.createMediaDocuments).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        brandId,
        category: IngredientCategory.VOICE,
        extension: MetadataExtension.MP3,
        model: elevenLabsModel,
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
          model: elevenLabsModel,
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
    const pinned = build(skillRuntime);
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

  it('re-enqueues an idempotent source-action retry with its accepted model', async () => {
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      modelUsed: MODEL_KEYS.ELEVENLABS_MULTILINGUAL_V2,
      status: IngredientStatus.PROCESSING,
    });

    const result = await service.generate(user, {
      sourceActionId: 'voice-card-1',
      text: 'Hello',
      voiceId: 'voice-1',
    });

    expect(result).toMatchObject({ id: ingredientId });
    expect(shared.createMediaDocuments).not.toHaveBeenCalled();
    expect(router.selectModel).not.toHaveBeenCalled();
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
          model: MODEL_KEYS.ELEVENLABS_MULTILINGUAL_V2,
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

  it('renders ElevenLabs speech with the chosen model and settles the exact quote', async () => {
    processingThenGenerated();

    const result = await service.executeQueuedGeneration(
      queued({ model: MODEL_KEYS.ELEVENLABS_FLASH_V2_5 }),
    );

    expect(credits.quoteSpeech).toHaveBeenCalledWith({
      characters: 5,
      modelKey: MODEL_KEYS.ELEVENLABS_FLASH_V2_5,
      organizationId,
      provider: 'elevenlabs',
    });
    expect(elevenLabs.generateAndUploadAudio).toHaveBeenCalledWith(
      'voice-1',
      'Hello',
      ingredientId,
      organizationId,
      userId,
      'platform-key',
      { modelId: 'eleven_flash_v2_5' },
    );
    expect(voices.patchAll).toHaveBeenCalledWith(
      { id: ingredientId, isDeleted: false, organizationId },
      expect.objectContaining({
        duration: 90,
        providerData: {
          speechBilling: {
            billingMode: 'platform',
            characters: 5,
            credits: 2,
            modelKey: MODEL_KEYS.ELEVENLABS_FLASH_V2_5,
            rateVersion: 'rate-v1',
          },
        },
        s3Key: 'ingredients/musics/voice-1',
        status: IngredientStatus.GENERATED,
      }),
    );
    expect(credits.settleSpeechCredits).toHaveBeenCalledWith({
      credits: 2,
      ingredientId,
      organizationId,
      userId,
    });
    expect(result).toMatchObject({ id: ingredientId });
  });

  it('quotes the skill-rewritten text that is actually sent', async () => {
    const skillRuntime = {
      applyAuthorizedSkillPrompt: vi
        .fn()
        .mockResolvedValue('Hello there, friend'),
    };
    const withSkills = build(skillRuntime);
    processingThenGenerated();

    await withSkills.executeQueuedGeneration(
      queued({ requestedSkillSlugs: ['narration'] }),
    );

    expect(credits.quoteSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ characters: 19 }),
    );
    expect(elevenLabs.generateAndUploadAudio).toHaveBeenCalledWith(
      'voice-1',
      'Hello there, friend',
      ingredientId,
      organizationId,
      userId,
      'platform-key',
      { modelId: 'eleven_v4' },
    );
  });

  describe('HeyGen Voice dispatch', () => {
    it('speaks on the platform key, stores the WAV durably, and charges platform credits', async () => {
      processingThenGenerated();

      await service.executeQueuedGeneration(
        queued({ model: MODEL_KEYS.HEYGEN_VOICE, voiceId: 'public-voice' }),
      );

      expect(heygen.resolveSpeechConnection).toHaveBeenCalledWith(
        organizationId,
        'public-voice',
      );
      expect(credits.quoteSpeech).toHaveBeenCalledWith({
        characters: 5,
        modelKey: MODEL_KEYS.HEYGEN_VOICE,
        organizationId,
        provider: 'heygen',
      });
      expect(heygen.generateSpeech).toHaveBeenCalledWith({
        apiKeyOverride: 'platform-key',
        organizationId,
        text: 'Hello',
        voiceId: 'public-voice',
      });
      expect(files.uploadToS3).toHaveBeenCalledWith(
        `${ingredientId}.wav`,
        'musics',
        {
          type: FileInputType.URL,
          url: 'https://files.heygen.ai/tts/voice.wav',
        },
      );
      expect(voices.patchAll).toHaveBeenCalledWith(
        { id: ingredientId, isDeleted: false, organizationId },
        expect.objectContaining({
          duration: 1.5,
          s3Key: 'stored-voice.wav',
          status: IngredientStatus.GENERATED,
        }),
      );
      expect(credits.settleSpeechCredits).toHaveBeenCalledWith(
        expect.objectContaining({ credits: 2, ingredientId }),
      );
      expect(elevenLabs.generateAndUploadAudio).not.toHaveBeenCalled();
    });

    it('never debits platform credits when the workspace HeyGen key speaks', async () => {
      heygen.resolveSpeechConnection.mockResolvedValue(byokConnection);
      processingThenGenerated();

      await service.executeQueuedGeneration(
        queued({ model: MODEL_KEYS.HEYGEN_VOICE, voiceId: 'my-clone' }),
      );

      expect(heygen.generateSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ apiKeyOverride: 'workspace-key' }),
      );
      expect(voices.patchAll).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          providerData: {
            speechBilling: expect.objectContaining({ billingMode: 'byok' }),
          },
        }),
      );
      expect(credits.settleSpeechCredits).not.toHaveBeenCalled();
    });

    it('counts HeyGen characters as Unicode code points on the exact text', async () => {
      processingThenGenerated();

      await service.executeQueuedGeneration(
        queued({
          model: MODEL_KEYS.HEYGEN_VOICE,
          text: ' 🎙️ ok ',
          voiceId: 'public-voice',
        }),
      );

      // Space, microphone, variation selector, space, o, k, space.
      expect(credits.quoteSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ characters: 7 }),
      );
      expect(heygen.generateSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ text: ' 🎙️ ok ' }),
      );
    });

    it('refuses to dispatch without a reviewed rate and fails the ingredient', async () => {
      voices.findOne.mockResolvedValue({
        id: ingredientId,
        status: IngredientStatus.PROCESSING,
      });
      credits.quoteSpeech.mockRejectedValue(
        new ServiceUnavailableException('Speech pricing is unavailable'),
      );

      await expect(
        service.executeQueuedGeneration(
          queued({ model: MODEL_KEYS.HEYGEN_VOICE, voiceId: 'public-voice' }),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(heygen.generateSpeech).not.toHaveBeenCalled();
      expect(voices.patchAll).toHaveBeenLastCalledWith(
        { id: ingredientId, isDeleted: false, organizationId, s3Key: null },
        { status: IngredientStatus.FAILED },
      );
      expect(credits.settleSpeechCredits).not.toHaveBeenCalled();
    });

    it('fails without charging when the audio cannot be stored', async () => {
      voices.findOne.mockResolvedValue({
        id: ingredientId,
        status: IngredientStatus.PROCESSING,
      });
      files.uploadToS3.mockResolvedValue({ publicUrl: 'https://cdn/x.wav' });

      await expect(
        service.executeQueuedGeneration(
          queued({ model: MODEL_KEYS.HEYGEN_VOICE, voiceId: 'public-voice' }),
        ),
      ).rejects.toMatchObject({
        response: { detail: 'HeyGen Voice audio could not be stored' },
      });
      expect(credits.settleSpeechCredits).not.toHaveBeenCalled();
    });
  });

  it('preserves typed HTTP failures from deferred settlement', async () => {
    processingThenGenerated();
    credits.settleSpeechCredits.mockRejectedValue(
      new HttpException(
        { detail: 'Insufficient credits' },
        HttpStatus.PAYMENT_REQUIRED,
      ),
    );

    await expect(
      service.executeQueuedGeneration(queued()),
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
      service.executeQueuedGeneration(queued()),
    ).rejects.toMatchObject({
      response: { detail: 'provider unavailable' },
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    expect(voices.patchAll).toHaveBeenLastCalledWith(
      { id: ingredientId, isDeleted: false, organizationId, s3Key: null },
      { status: IngredientStatus.FAILED },
    );
    expect(credits.settleSpeechCredits).not.toHaveBeenCalled();
    expect(activities.record).toHaveBeenCalledWith(
      expect.objectContaining({
        key: ActivityKey.VOICE_FAILED,
        organizationId,
        userId,
        entityId: ingredientId,
      }),
    );
  });

  it('reconciles a persisted voice before retrying provider work and settles its stored receipt', async () => {
    voices.findOne.mockResolvedValue({
      cdnUrl: 'https://example.com/generated.mp3',
      duration: 90,
      id: ingredientId,
      providerData: {
        speechBilling: {
          billingMode: 'platform',
          characters: 900,
          credits: 25,
          modelKey: elevenLabsModel,
          rateVersion: 'rate-v1',
        },
      },
      status: IngredientStatus.GENERATED,
    });

    const result = await service.executeQueuedGeneration(queued());

    expect(result).toMatchObject({ id: ingredientId });
    expect(elevenLabs.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(credits.quoteSpeech).not.toHaveBeenCalled();
    expect(credits.settleSpeechCredits).toHaveBeenCalledWith({
      credits: 25,
      ingredientId,
      organizationId,
      userId,
    });
  });

  it('does not charge a persisted BYOK voice on replay', async () => {
    voices.findOne.mockResolvedValue({
      cdnUrl: 'https://example.com/generated.wav',
      id: ingredientId,
      providerData: {
        speechBilling: {
          billingMode: 'byok',
          characters: 5,
          credits: 2,
          modelKey: MODEL_KEYS.HEYGEN_VOICE,
          rateVersion: 'rate-v1',
        },
      },
      status: IngredientStatus.GENERATED,
    });

    await service.executeQueuedGeneration(
      queued({ model: MODEL_KEYS.HEYGEN_VOICE }),
    );

    expect(credits.settleSpeechCredits).not.toHaveBeenCalled();
  });

  describe('ElevenLabs account binding', () => {
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

      await service.generate(user, {
        text: 'Hello',
        voiceId: 'saved-voice-1',
      });

      expect(accountVoices.resolveSpeechVoice).toHaveBeenCalledWith(
        organizationId,
        'saved-voice-1',
      );
      expect(voices.patchAll).toHaveBeenCalledWith(
        { id: ingredientId, organizationId },
        {
          generationProvider: {
            ...speechReceipt(elevenLabsPersonalBinding),
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

    it('speaks through the bound personal key and never debits platform credits', async () => {
      voices.findOne
        .mockResolvedValueOnce({
          generationProvider: speechReceipt(elevenLabsPersonalBinding),
          id: ingredientId,
          status: IngredientStatus.PROCESSING,
        })
        .mockResolvedValue({
          cdnUrl: 'https://example.com/generated.mp3',
          id: ingredientId,
          status: IngredientStatus.GENERATED,
        });

      await service.executeQueuedGeneration(queued());

      expect(voices.prisma.ingredient.updateMany).toHaveBeenCalledWith({
        data: {
          generationProvider: speechReceipt(
            elevenLabsPersonalBinding,
            'submitted',
          ),
        },
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
        { modelId: 'eleven_v4' },
      );
      expect(voices.patchAll).toHaveBeenCalledWith(
        { id: ingredientId, isDeleted: false, organizationId },
        expect.objectContaining({
          generationProvider: speechReceipt(
            elevenLabsPersonalBinding,
            'completed',
          ),
          providerData: {
            speechBilling: expect.objectContaining({ billingMode: 'byok' }),
          },
        }),
      );
      expect(accountVoices.resolveSpeechVoice).not.toHaveBeenCalled();
      expect(credits.settleSpeechCredits).not.toHaveBeenCalled();
    });

    it('refuses a request whose personal connection changed after submission', async () => {
      voices.findOne.mockResolvedValue({
        generationProvider: speechReceipt({
          ...elevenLabsPersonalBinding,
          credentialVersionId: 'credential-v0',
        }),
        id: ingredientId,
        status: IngredientStatus.PROCESSING,
      });

      await expect(service.executeQueuedGeneration(queued())).rejects.toThrow(
        'The ElevenLabs connection changed',
      );
      expect(elevenLabs.generateAndUploadAudio).not.toHaveBeenCalled();
      expect(voices.prisma.ingredient.updateMany).not.toHaveBeenCalled();
    });

    it('does not resend a submitted request whose result is unknown', async () => {
      voices.findOne.mockResolvedValue({
        generationProvider: speechReceipt(
          elevenLabsPlatformBinding,
          'submitted',
        ),
        id: ingredientId,
        status: IngredientStatus.PROCESSING,
      });
      voices.prisma.ingredient.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.executeQueuedGeneration(queued()),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
      expect(elevenLabs.generateAndUploadAudio).not.toHaveBeenCalled();
      expect(voices.patchAll).toHaveBeenLastCalledWith(
        { id: ingredientId, isDeleted: false, organizationId, s3Key: null },
        { status: IngredientStatus.FAILED },
      );
      expect(credits.settleSpeechCredits).not.toHaveBeenCalled();
    });

    it('turns an inaccessible provider voice into an actionable failure', async () => {
      voices.findOne.mockResolvedValue({
        generationProvider: speechReceipt(elevenLabsPersonalBinding),
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
        service.executeQueuedGeneration(queued()),
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
});
