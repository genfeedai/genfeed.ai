import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import type { Request } from 'express';

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
  const request = {} as Request;
  let elevenLabs: { generateAndUploadAudio: ReturnType<typeof vi.fn> };
  let logger: { error: ReturnType<typeof vi.fn> };
  let shared: { createMediaDocuments: ReturnType<typeof vi.fn> };
  let credits: {
    assertOrganizationCanAfford: ReturnType<typeof vi.fn>;
    settleBackgroundGenerationCredits: ReturnType<typeof vi.fn>;
    settleGenerationCredits: ReturnType<typeof vi.fn>;
  };
  let voices: {
    findOne: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
  };
  let queue: { queueVoiceGeneration: ReturnType<typeof vi.fn> };
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
      settleGenerationCredits: vi.fn(),
    };
    voices = {
      findOne: vi.fn().mockResolvedValue({
        id: ingredientId,
        status: IngredientStatus.GENERATED,
      }),
      patchAll: vi.fn(),
    };
    queue = { queueVoiceGeneration: vi.fn() };
    service = new VoiceGenerationService(
      elevenLabs as unknown as ElevenLabsService,
      logger as unknown as LoggerService,
      shared as unknown as SharedService,
      credits as unknown as VoiceCreditsService,
      voices as unknown as VoicesService,
      queue as never,
    );
  });

  it.each([
    [{ text: '', voiceId: 'voice-1' }, 'Text is required'],
    [{ text: 'Hello', voiceId: '' }, 'voiceId is required'],
  ])(
    'validates required generation input before spending',
    async (dto, detail) => {
      await expect(service.generate(user, dto, request)).rejects.toMatchObject({
        response: { detail },
        status: HttpStatus.BAD_REQUEST,
      });
      expect(shared.createMediaDocuments).not.toHaveBeenCalled();
    },
  );

  it('creates, renders, settles, and returns a generated voice', async () => {
    const result = await service.generate(
      user,
      { text: 'Hello', voiceId: 'voice-1', waitForCompletion: true },
      request,
    );

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
    expect(credits.settleGenerationCredits).toHaveBeenCalledWith(
      request,
      organizationId,
      90,
    );
    expect(result).toMatchObject({ id: ingredientId });
  });

  it('marks the ingredient failed when rendering fails', async () => {
    elevenLabs.generateAndUploadAudio.mockRejectedValue(
      new Error('provider unavailable'),
    );

    await expect(
      service.generate(
        user,
        { text: 'Hello', voiceId: 'voice-1', waitForCompletion: true },
        request,
      ),
    ).rejects.toMatchObject({
      response: { detail: 'provider unavailable' },
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    expect(voices.patchAll).toHaveBeenLastCalledWith(
      { id: ingredientId, isDeleted: false, organizationId },
      { status: IngredientStatus.FAILED },
    );
  });

  it('preserves typed HTTP failures from deferred settlement', async () => {
    const settlementError = new HttpException(
      'Insufficient credits',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    credits.settleGenerationCredits.mockRejectedValue(settlementError);

    await expect(
      service.generate(
        user,
        { text: 'Hello', voiceId: 'voice-1', waitForCompletion: true },
        request,
      ),
    ).rejects.toBe(settlementError);
    expect(voices.patchAll).toHaveBeenLastCalledWith(
      { id: ingredientId, isDeleted: false, organizationId },
      { status: IngredientStatus.FAILED },
    );
  });

  it('returns the persisted placeholder and queues voice rendering when waiting is disabled', async () => {
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    const result = await service.generate(
      user,
      { text: 'Hello', voiceId: 'voice-1', waitForCompletion: false },
      request,
    );

    expect(result).toMatchObject({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });
    expect(elevenLabs.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(queue.queueVoiceGeneration).toHaveBeenCalledWith({
      ingredientId,
      organizationId,
      text: 'Hello',
      userId,
      voiceId: 'voice-1',
    });
  });

  it('re-reserves background work for an idempotent source-action retry', async () => {
    voices.findOne.mockResolvedValue({
      id: ingredientId,
      status: IngredientStatus.PROCESSING,
    });

    const result = await service.generate(
      user,
      {
        sourceActionId: 'voice-card-1',
        text: 'Hello',
        voiceId: 'voice-1',
        waitForCompletion: false,
      },
      request,
    );

    expect(result).toMatchObject({ id: ingredientId });
    expect(shared.createMediaDocuments).not.toHaveBeenCalled();
    expect(queue.queueVoiceGeneration).toHaveBeenCalledWith({
      ingredientId,
      organizationId,
      text: 'Hello',
      userId,
      voiceId: 'voice-1',
    });
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
