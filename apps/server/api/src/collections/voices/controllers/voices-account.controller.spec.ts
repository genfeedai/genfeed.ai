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
  const brandId = testId('brand');
  const user = { brandId, id: 'user-1', organizationId } as User;
  const voice = { id: testId('voice') };
  let accountVoices: {
    browse: ReturnType<typeof vi.fn>;
    import: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
  };
  let controller: VoicesAccountController;

  beforeEach(() => {
    vi.clearAllMocks();
    // Each fake echoes the scope it was called with into its result.
    accountVoices = {
      browse: vi.fn(),
      import: vi.fn(async (importer: User, externalVoiceId: string) => ({
        ...voice,
        brandId: importer.brandId,
        externalVoiceId,
        organizationId: importer.organizationId,
      })),
      unlink: vi.fn(async (voiceOrganizationId: string, voiceId: string) => ({
        id: voiceId,
        organizationId: voiceOrganizationId,
      })),
    };
    controller = new VoicesAccountController(
      accountVoices as unknown as ElevenLabsAccountVoicesService,
    );
  });

  it('browses the caller organization account', async () => {
    accountVoices.browse.mockImplementation(
      async (browserOrganizationId: string, query: { search?: string }) => ({
        connection: { status: 'connected' },
        hasMore: false,
        nextPageToken: null,
        voices: [{ name: query.search, organizationId: browserOrganizationId }],
      }),
    );

    await expect(
      controller.findAccountVoices(user, { search: 'clone' }),
    ).resolves.toEqual({
      data: {
        connection: { status: 'connected' },
        hasMore: false,
        nextPageToken: null,
        voices: [{ name: 'clone', organizationId }],
      },
    });
  });

  it('imports a voice and serializes the saved reference', async () => {
    const imported = {
      ...voice,
      brandId,
      externalVoiceId: 'el-voice-1',
      organizationId,
    };

    await expect(
      controller.importAccountVoice(request, user, {
        externalVoiceId: 'el-voice-1',
      }),
    ).resolves.toEqual(imported);
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      VoiceSerializer,
      imported,
    );
  });

  it('unlinks within the caller organization', async () => {
    await expect(
      controller.unlinkImportedVoice(request, user, voice.id),
    ).resolves.toEqual({ id: voice.id, organizationId });
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
