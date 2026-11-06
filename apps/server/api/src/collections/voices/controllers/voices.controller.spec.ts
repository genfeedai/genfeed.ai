import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoicesController } from '@api/collections/voices/controllers/voices.controller';
import type { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import type { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import type { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import { VoiceCloneSerializer, VoiceSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
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
    (_request: unknown, serializer: unknown, data: unknown) => ({
      data,
      serializer,
    }),
  ),
  serializeSingle: vi.fn(
    (_request: unknown, serializer: unknown, data: unknown) => ({
      data,
      serializer,
    }),
  ),
}));

type Voice = { id: string; isCloned: boolean; userId: string };

describe('VoicesController', () => {
  const request = {} as Request;
  const user = { id: 'user-1' } as User;
  const query = {} as VoicesQueryDto;
  const libraryVoice: Voice = {
    id: testId('voice', 1),
    isCloned: false,
    userId: 'user-1',
  };
  const clonedVoice: Voice = {
    id: testId('voice', 2),
    isCloned: true,
    userId: 'user-1',
  };
  let voices: Voice[];
  let controller: VoicesController;

  beforeEach(() => {
    voices = [
      libraryVoice,
      clonedVoice,
      { id: testId('voice', 3), isCloned: true, userId: 'user-2' },
    ];
    const own = (caller: User) =>
      voices.filter((voice) => voice.userId === caller.id);
    const library = {
      findAll: async (caller: User) => {
        const docs = own(caller);
        return { docs, totalDocs: docs.length };
      },
      findCloned: async (caller: User) => {
        const docs = own(caller).filter((voice) => voice.isCloned);
        return { docs, totalDocs: docs.length };
      },
    };
    const clones = {
      deleteClonedVoice: async (caller: User, id: string) => {
        const voice = own(caller).find(
          (item) => item.id === id && item.isCloned,
        );
        if (!voice) return null;
        voices = voices.filter((item) => item !== voice);
        return voice;
      },
    };
    controller = new VoicesController(
      clones as unknown as VoiceCloneService,
      library as unknown as VoiceLibraryService,
    );
  });

  it('serializes the caller’s voice library as voices', async () => {
    await expect(controller.findAll(query, request, user)).resolves.toEqual({
      data: { docs: [libraryVoice, clonedVoice], totalDocs: 2 },
      serializer: VoiceSerializer,
    });
  });

  it('serializes the caller’s cloned voices as clones', async () => {
    await expect(
      controller.findClonedVoices(request, user, query),
    ).resolves.toEqual({
      data: { docs: [clonedVoice], totalDocs: 1 },
      serializer: VoiceCloneSerializer,
    });
  });

  it('rejects an invalid cloned voice id before deleting anything', async () => {
    await expect(
      controller.deleteClonedVoice(request, user, 'invalid'),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(voices).toHaveLength(3);
  });

  it('deletes and returns the caller’s cloned voice', async () => {
    await expect(
      controller.deleteClonedVoice(request, user, clonedVoice.id),
    ).resolves.toEqual({ data: clonedVoice, serializer: VoiceCloneSerializer });
    expect(voices).not.toContainEqual(clonedVoice);
  });

  it.each([
    ['does not exist', testId('voice', 9)],
    ['belongs to another user', testId('voice', 3)],
  ])('returns not found when the cloned voice %s', async (_case, id) => {
    await expect(
      controller.deleteClonedVoice(request, user, id),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(voices).toHaveLength(3);
  });
});
