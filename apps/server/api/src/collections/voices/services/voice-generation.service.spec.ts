import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import type { Request } from 'express';

describe('VoiceGenerationService', () => {
  const ingredientId = '507f191e810c19729de860ea';
  const organizationId = '507f191e810c19729de860eb';
  const user = {
    id: 'auth-user-1',
    publicMetadata: {
      brand: '507f191e810c19729de860ec',
      organization: organizationId,
      user: '507f191e810c19729de860ed',
    },
  } as User;
  const request = {} as Request;
  let elevenLabs: { generateAndUploadAudio: ReturnType<typeof vi.fn> };
  let logger: { error: ReturnType<typeof vi.fn> };
  let shared: { saveDocuments: ReturnType<typeof vi.fn> };
  let credits: {
    assertOrganizationCanAfford: ReturnType<typeof vi.fn>;
    settleGenerationCredits: ReturnType<typeof vi.fn>;
  };
  let voices: {
    findOne: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
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
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: { id: ingredientId },
      }),
    };
    credits = {
      assertOrganizationCanAfford: vi.fn(),
      settleGenerationCredits: vi.fn(),
    };
    voices = {
      findOne: vi.fn().mockResolvedValue({
        id: ingredientId,
        status: IngredientStatus.GENERATED,
      }),
      patchAll: vi.fn(),
    };
    service = new VoiceGenerationService(
      elevenLabs as unknown as ElevenLabsService,
      logger as unknown as LoggerService,
      shared as unknown as SharedService,
      credits as unknown as VoiceCreditsService,
      voices as unknown as VoicesService,
    );
  });

  it.each([
    [{ text: '', voiceId: 'voice-1' }, 'Text is required'],
    [{ text: 'Hello', voiceId: '' }, 'voiceId is required'],
  ])('validates required generation input before spending', async (dto, detail) => {
    await expect(service.generate(user, dto, request)).rejects.toMatchObject({
      response: { detail },
      status: HttpStatus.BAD_REQUEST,
    });
    expect(shared.saveDocuments).not.toHaveBeenCalled();
  });

  it('creates, renders, settles, and returns a generated voice', async () => {
    const result = await service.generate(
      user,
      { text: 'Hello', voiceId: 'voice-1' },
      request,
    );

    expect(credits.assertOrganizationCanAfford).toHaveBeenCalledWith(
      organizationId,
      1,
    );
    expect(shared.saveDocuments).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        category: IngredientCategory.VOICE,
        organization: organizationId,
        status: IngredientStatus.PROCESSING,
        voiceSource: 'generated',
      }),
    );
    expect(elevenLabs.generateAndUploadAudio).toHaveBeenCalledWith(
      'voice-1',
      'Hello',
      ingredientId,
      organizationId,
      '507f191e810c19729de860ed',
    );
    expect(voices.patchAll).toHaveBeenCalledWith(
      { OR: [{ id: ingredientId }, { mongoId: ingredientId }] },
      expect.objectContaining({
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
      service.generate(user, { text: 'Hello', voiceId: 'voice-1' }, request),
    ).rejects.toMatchObject({
      response: { detail: 'provider unavailable' },
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    expect(voices.patchAll).toHaveBeenLastCalledWith(
      { OR: [{ id: ingredientId }, { mongoId: ingredientId }] },
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
      service.generate(user, { text: 'Hello', voiceId: 'voice-1' }, request),
    ).rejects.toBe(settlementError);
    expect(voices.patchAll).toHaveBeenLastCalledWith(
      { OR: [{ id: ingredientId }, { mongoId: ingredientId }] },
      { status: IngredientStatus.FAILED },
    );
  });
});
