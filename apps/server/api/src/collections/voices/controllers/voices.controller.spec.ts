import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoicesController } from '@api/collections/voices/controllers/voices.controller';
import type { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((name: string, id: string) => {
    throw new HttpException(
      { detail: `${name} ${id} not found`, title: `${name} not found` },
      HttpStatus.NOT_FOUND,
    );
  }),
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

describe('VoicesController', () => {
  const request = {} as Request;
  const user = { id: 'user-1' } as User;
  const query = {} as VoicesQueryDto;
  const voice = { id: '507f191e810c19729de860ea' };
  let cloneService: { deleteClonedVoice: ReturnType<typeof vi.fn> };
  let libraryService: {
    findAll: ReturnType<typeof vi.fn>;
    findCloned: ReturnType<typeof vi.fn>;
  };
  let controller: VoicesController;

  beforeEach(() => {
    cloneService = { deleteClonedVoice: vi.fn() };
    libraryService = { findAll: vi.fn(), findCloned: vi.fn() };
    controller = new VoicesController(
      cloneService as unknown as VoiceCloneService,
      libraryService as unknown as VoiceLibraryService,
    );
  });

  it('delegates the voice library listing', async () => {
    const collection = { docs: [voice], totalDocs: 1 };
    libraryService.findAll.mockResolvedValue(collection);

    await expect(controller.findAll(query, request, user)).resolves.toBe(
      collection,
    );
    expect(libraryService.findAll).toHaveBeenCalledWith(user, query);
  });

  it('delegates the cloned voice listing', async () => {
    const collection = { docs: [voice], totalDocs: 1 };
    libraryService.findCloned.mockResolvedValue(collection);

    await expect(
      controller.findClonedVoices(request, user, query),
    ).resolves.toBe(collection);
    expect(libraryService.findCloned).toHaveBeenCalledWith(user, query);
  });

  it('rejects an invalid cloned voice id before delegation', async () => {
    await expect(
      controller.deleteClonedVoice(request, user, 'invalid'),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(cloneService.deleteClonedVoice).not.toHaveBeenCalled();
  });

  it('returns the deleted cloned voice', async () => {
    cloneService.deleteClonedVoice.mockResolvedValue(voice);

    await expect(
      controller.deleteClonedVoice(request, user, voice.id),
    ).resolves.toBe(voice);
    expect(cloneService.deleteClonedVoice).toHaveBeenCalledWith(user, voice.id);
  });

  it('returns not found when the cloned voice does not exist', async () => {
    cloneService.deleteClonedVoice.mockResolvedValue(null);

    await expect(
      controller.deleteClonedVoice(request, user, voice.id),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });
});
