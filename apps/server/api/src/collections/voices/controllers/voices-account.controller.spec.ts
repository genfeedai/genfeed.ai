import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoicesAccountController } from '@api/collections/voices/controllers/voices-account.controller';
import type { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { VoiceSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((name: string, id: string) => {
    throw new HttpException(
      { detail: `${name} ${id} not found`, title: `${name} not found` },
      HttpStatus.NOT_FOUND,
    );
  }),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

describe('VoicesAccountController', () => {
  const request = {} as Request;
  const organizationId = testId('org');
  const user = { id: 'user-1', organizationId } as User;
  const voice = { id: testId('voice') };
  let accountVoices: {
    browse: ReturnType<typeof vi.fn>;
    import: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
  };
  let controller: VoicesAccountController;

  beforeEach(() => {
    vi.clearAllMocks();
    accountVoices = {
      browse: vi.fn(),
      import: vi.fn().mockResolvedValue(voice),
      unlink: vi.fn().mockResolvedValue(voice),
    };
    controller = new VoicesAccountController(
      accountVoices as unknown as ElevenLabsAccountVoicesService,
    );
  });

  it('browses the caller organization account', async () => {
    const page = {
      connection: { status: 'connected' },
      hasMore: false,
      nextPageToken: null,
      voices: [],
    };
    accountVoices.browse.mockResolvedValue(page);

    await expect(
      controller.findAccountVoices(user, { search: 'clone' }),
    ).resolves.toEqual({ data: page });
    expect(accountVoices.browse).toHaveBeenCalledWith(organizationId, {
      search: 'clone',
    });
  });

  it('imports a voice and serializes the saved reference', async () => {
    await controller.importAccountVoice(request, user, {
      externalVoiceId: 'el-voice-1',
    });

    expect(accountVoices.import).toHaveBeenCalledWith(user, 'el-voice-1');
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      VoiceSerializer,
      voice,
    );
  });

  it('unlinks within the caller organization', async () => {
    await controller.unlinkImportedVoice(request, user, voice.id);

    expect(accountVoices.unlink).toHaveBeenCalledWith(organizationId, voice.id);
  });

  it('rejects malformed ids and reports missing references', async () => {
    await expect(
      controller.unlinkImportedVoice(request, user, 'not-an-id'),
    ).rejects.toBeInstanceOf(BadRequestException);

    accountVoices.unlink.mockResolvedValue(null);
    await expect(
      controller.unlinkImportedVoice(request, user, voice.id),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });
});
