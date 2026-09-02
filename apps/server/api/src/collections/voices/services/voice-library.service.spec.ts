import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { VoiceProvider } from '@genfeedai/contracts';
import { VoiceProvider as DbVoiceProvider } from '@genfeedai/prisma';
import { HttpStatus } from '@nestjs/common';

vi.mock('@api/helpers/utils/sort/sort.util', () => ({
  handleQuerySort: vi.fn(() => ({ createdAt: -1 })),
}));

describe('VoiceLibraryService', () => {
  const brandId = 'brand-1';
  const organizationId = 'org-1';
  const user = {
    id: 'user-1',
    brandId: brandId,
    organizationId: organizationId,
    userId: 'canonical-user-1',
  } as User;
  let voicesService: { findAll: ReturnType<typeof vi.fn> };
  let catalogService: { findAll: ReturnType<typeof vi.fn> };
  let service: VoiceLibraryService;

  beforeEach(() => {
    voicesService = { findAll: vi.fn().mockResolvedValue({ docs: [] }) };
    catalogService = { findAll: vi.fn().mockResolvedValue([]) };
    service = new VoiceLibraryService(
      voicesService as unknown as VoicesService,
      catalogService as unknown as ExternalVoiceCatalogService,
    );
  });

  it('builds the tenant-scoped cloned/generated voice query', async () => {
    await service.findAll(user, {
      isActive: true,
      providers: [VoiceProvider.ELEVENLABS],
      search: ' narrator ',
    } as VoicesQueryDto);

    expect(voicesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: -1 },
        where: expect.objectContaining({
          AND: [
            {
              OR: expect.arrayContaining([
                { label: { contains: 'narrator', mode: 'insensitive' } },
              ]),
            },
          ],
          OR: [{ isCloned: true }, { externalVoiceCatalogId: { not: null } }],
          category: 'VOICE',
          isDeleted: false,
          isVoiceActive: { not: false },
          organizationId,
          voiceProvider: { in: [VoiceProvider.ELEVENLABS] },
        }),
      }),
      expect.any(Object),
    );
  });

  it('ignores query attempts to override tenant scope', async () => {
    await service.findAll(user, {
      brand: 'attacker-brand',
      organization: 'attacker-org',
    } as unknown as VoicesQueryDto);

    const query = voicesService.findAll.mock.calls[0]?.[0];
    expect(query.where).toMatchObject({ organizationId });
    expect(query.where).not.toHaveProperty('brandId');
  });

  it('scopes cloned voices by organizationId', async () => {
    await service.findCloned(user, {} as VoicesQueryDto);

    expect(voicesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category: 'VOICE',
          isCloned: true,
          isDeleted: false,
          organizationId,
        },
      }),
      expect.any(Object),
    );
  });

  it('keeps the established library failure response', async () => {
    voicesService.findAll.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.findAll(user, {} as VoicesQueryDto),
    ).rejects.toMatchObject({
      message: 'Failed to find voices',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });

  it('falls back to the platform catalog when the org has no voice ingredients', async () => {
    catalogService.findAll.mockResolvedValue([
      {
        createdAt: new Date('2026-01-01'),
        externalId: 'eleven-rachel',
        externalProvider: DbVoiceProvider.ELEVENLABS,
        id: 'catalog-1',
        isActive: true,
        isDefaultSelectable: true,
        isFeatured: false,
        language: 'en',
        name: 'Rachel',
        providerData: {},
        sampleAudioUrl: 'https://example.test/rachel.mp3',
        updatedAt: new Date('2026-01-02'),
      },
    ]);

    const result = await service.findAll(user, {
      isActive: true,
      limit: 12,
      page: 1,
    } as VoicesQueryDto);

    expect(catalogService.findAll).toHaveBeenCalledWith({
      isActive: true,
      search: undefined,
    });
    expect(result.docs).toEqual([
      expect.objectContaining({
        externalVoiceId: 'eleven-rachel',
        id: 'catalog-1',
        voiceSource: 'catalog',
      }),
    ]);
    expect(result.totalDocs).toBe(1);
  });

  it('does not read the catalog when the org already has cloned or catalog-linked voices', async () => {
    voicesService.findAll.mockResolvedValue({
      docs: [{ id: 'cloned-1', isCloned: true }],
      totalDocs: 1,
    });

    const result = await service.findAll(user, {} as VoicesQueryDto);

    expect(catalogService.findAll).not.toHaveBeenCalled();
    expect(result.docs).toEqual([{ id: 'cloned-1', isCloned: true }]);
  });
});
