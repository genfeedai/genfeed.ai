import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { AGENT_RUNTIME_ACTION_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

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
  };
  let workflowRunner: {
    enqueueWorkflow: ReturnType<typeof vi.fn>;
    registerAction: ReturnType<typeof vi.fn>;
  };
  let service: VoiceGenerationService;

  beforeEach(() => {
    elevenLabs = {
      generateAndUploadAudio: vi.fn().mockResolvedValue({
        audioUrl: 'https://example.com/generated.mp3',
        duration: 90,
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
    };
    workflowRunner = {
      enqueueWorkflow: vi.fn(),
      registerAction: vi.fn(),
    };
    service = new VoiceGenerationService(
      elevenLabs as unknown as ElevenLabsService,
      logger as unknown as LoggerService,
      shared as unknown as SharedService,
      credits as unknown as VoiceCreditsService,
      voices as unknown as VoicesService,
      workflowRunner as never,
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
    );
    expect(result).toMatchObject({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });
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
    );
    expect(voices.patchAll).toHaveBeenCalledWith(
      { id: ingredientId, isDeleted: false, organizationId },
      expect.objectContaining({
        cdnUrl: 'https://example.com/generated.mp3',
        duration: 90,
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
      { id: ingredientId, isDeleted: false, organizationId },
      { status: IngredientStatus.FAILED },
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
});
