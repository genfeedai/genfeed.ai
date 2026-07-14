import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoicesOperationsController } from '@api/collections/voices/controllers/voices-operations.controller';
import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import {
  CREDITS_DEFER_MODEL_RESOLUTION_KEY,
  CREDITS_KEY,
} from '@api/helpers/decorators/credits/credits.decorator';
import { ActivitySource } from '@genfeedai/enums';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

describe('VoicesOperationsController', () => {
  const request = {} as Request;
  const user = { id: 'user-1' } as User;
  const voice = { id: 'voice-1' };
  let cloneService: { clone: ReturnType<typeof vi.fn> };
  let generationService: { generate: ReturnType<typeof vi.fn> };
  let controller: VoicesOperationsController;

  beforeEach(() => {
    cloneService = { clone: vi.fn().mockResolvedValue(voice) };
    generationService = { generate: vi.fn().mockResolvedValue(voice) };
    controller = new VoicesOperationsController(
      cloneService as unknown as VoiceCloneService,
      generationService as unknown as VoiceGenerationService,
    );
  });

  it('delegates generation and preserves the serialized response', async () => {
    const dto = { text: 'Hello', voiceId: 'voice-1' };

    await expect(controller.generate(request, user, dto)).resolves.toBe(voice);
    expect(generationService.generate).toHaveBeenCalledWith(user, dto, request);
  });

  it('delegates cloning with the optional upload', async () => {
    const dto = { audioUrl: 'https://example.com/audio.mp3', name: 'Clone' };
    const file = { buffer: Buffer.from('audio') } as Express.Multer.File;

    await expect(controller.cloneVoice(request, user, dto, file)).resolves.toBe(
      voice,
    );
    expect(cloneService.clone).toHaveBeenCalledWith(user, dto, file, request);
  });

  it.each([
    ['generate', VoicesOperationsController.prototype.generate],
    ['clone', VoicesOperationsController.prototype.cloneVoice],
  ])('keeps deferred credit settlement on %s', (_name, handler) => {
    const reflector = new Reflector();

    expect(reflector.get(CREDITS_DEFER_MODEL_RESOLUTION_KEY, handler)).toBe(
      true,
    );
    expect(reflector.get(CREDITS_KEY, handler)).toMatchObject({
      source: ActivitySource.VOICE_GENERATION,
    });
  });
});
