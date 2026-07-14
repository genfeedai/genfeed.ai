import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoicesCatalogController } from '@api/collections/voices/controllers/voices-catalog.controller';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoiceProvider } from '@genfeedai/enums';
import { VoiceProvider as DbVoiceProvider } from '@genfeedai/prisma';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

const isSuperAdmin = vi.fn();

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: (...args: unknown[]) => isSuperAdmin(...args),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn(() => {
    throw new HttpException('Not found', HttpStatus.NOT_FOUND);
  }),
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

describe('VoicesCatalogController', () => {
  const request = {} as Request;
  const user = { id: 'user-1' } as User;
  const id = '507f191e810c19729de860ea';
  const catalogVoice = {
    createdAt: new Date('2026-01-01'),
    externalId: 'external-1',
    externalProvider: DbVoiceProvider.ELEVENLABS,
    id,
    isActive: true,
    isDefaultSelectable: true,
    isFeatured: false,
    language: 'en',
    name: 'Voice',
    providerData: {},
    sampleAudioUrl: null,
    updatedAt: new Date('2026-01-02'),
  };
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let controller: VoicesCatalogController;

  beforeEach(() => {
    isSuperAdmin.mockReturnValue(true);
    service = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
      syncFromProviders: vi.fn(),
    };
    controller = new VoicesCatalogController(
      service as unknown as ExternalVoiceCatalogService,
    );
  });

  it('maps and returns the external catalog', async () => {
    service.findAll.mockResolvedValue([catalogVoice]);

    const result = await controller.findCatalog(request, 'elevenlabs', 'test');

    expect(service.findAll).toHaveBeenCalledWith({
      provider: DbVoiceProvider.ELEVENLABS,
      search: 'test',
    });
    expect(result).toMatchObject({
      docs: [{ externalVoiceId: 'external-1', provider: 'elevenlabs' }],
      totalDocs: 1,
    });
  });

  it('wraps catalog read failures in the established 500 response', async () => {
    service.findAll.mockRejectedValue(new Error('provider unavailable'));

    await expect(controller.findCatalog(request)).rejects.toMatchObject({
      message: 'Failed to find catalog voices',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });

  it('rejects catalog mutation by a non-super-admin', async () => {
    isSuperAdmin.mockReturnValue(false);

    await expect(
      controller.patchCatalogVoice(request, user, id, { isActive: true }),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('validates that a catalog patch changes at least one flag', async () => {
    await expect(
      controller.patchCatalogVoice(request, user, id, {}),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(service.findOne).not.toHaveBeenCalled();
  });

  it('patches a catalog voice without changing the wire contract', async () => {
    service.findOne.mockResolvedValue(catalogVoice);
    service.patch.mockResolvedValue({ ...catalogVoice, isFeatured: true });

    await expect(
      controller.patchCatalogVoice(request, user, id, { isFeatured: true }),
    ).resolves.toMatchObject({
      externalVoiceId: 'external-1',
      isFeatured: true,
    });
    expect(service.patch).toHaveBeenCalledWith(id, {
      isActive: undefined,
      isDefaultSelectable: undefined,
      isFeatured: true,
    });
  });

  it('imports only syncable catalog providers', async () => {
    const syncResult = { created: 1, total: 1, updated: 0 };
    service.syncFromProviders.mockResolvedValue(syncResult);

    await expect(
      controller.importCatalogVoices(request, user, {
        providers: [VoiceProvider.ELEVENLABS, VoiceProvider.GENFEED_AI],
      }),
    ).resolves.toEqual({ data: syncResult });
    expect(service.syncFromProviders).toHaveBeenCalledWith([
      DbVoiceProvider.ELEVENLABS,
    ]);
  });

  it.each([
    ['findCatalog', VoicesCatalogController.prototype.findCatalog],
    ['patchCatalogVoice', VoicesCatalogController.prototype.patchCatalogVoice],
    [
      'importCatalogVoices',
      VoicesCatalogController.prototype.importCatalogVoices,
    ],
  ])('preserves the public VoicesController operation id for %s', (name, handler) => {
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      operationId: `VoicesController.${name}`,
      summary: name,
    });
  });
});
