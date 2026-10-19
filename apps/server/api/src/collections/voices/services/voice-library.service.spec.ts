import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { tenantReadQuery } from '@api-test/helpers/tenant-read.fixture';
import { VoiceProvider } from '@genfeedai/contracts';
import { VoiceProvider as DbVoiceProvider } from '@genfeedai/prisma';
import { TenantIsolationError } from '@libs/prisma/tenant-guard';
import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';

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
  let catalogService: { findRange: ReturnType<typeof vi.fn> };
  let service: VoiceLibraryService;

  beforeEach(async () => {
    voicesService = { findAll: vi.fn().mockResolvedValue({ docs: [] }) };
    catalogService = {
      findRange: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
    };
    const module = await Test.createTestingModule({
      providers: [
        VoiceLibraryService,
        { provide: VoicesService, useValue: voicesService },
        { provide: ExternalVoiceCatalogService, useValue: catalogService },
      ],
    }).compile();
    service = module.get<VoiceLibraryService>(VoiceLibraryService);
  });

  it('builds the tenant-scoped cloned/generated voice query', async () => {
    await service.findAll(
      user,
      tenantReadQuery(VoicesQueryDto, {
        isActive: true,
        providers: [VoiceProvider.ELEVENLABS],
        search: ' narrator ',
      }),
    );

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
          OR: [
            { isCloned: true },
            { externalVoiceCatalogId: { not: null } },
            { voiceSource: 'imported' },
          ],
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
    await service.findCloned(user, tenantReadQuery(VoicesQueryDto, {}));

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

  it.each(['findAll', 'findCloned'] as const)(
    'preserves tenant isolation errors in %s',
    async (method) => {
      const error = new TenantIsolationError(
        'Ingredient',
        'findMany',
        'organization-id-mismatch',
        'Mismatched tenant',
      );
      voicesService.findAll.mockRejectedValue(error);
      await expect(
        service[method](user, tenantReadQuery(VoicesQueryDto)),
      ).rejects.toBe(error);
    },
  );

  it('keeps the established library failure response', async () => {
    voicesService.findAll.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.findAll(user, tenantReadQuery(VoicesQueryDto, {})),
    ).rejects.toMatchObject({
      message: 'Failed to find voices',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });

  it('falls back to the platform catalog when the org has no voice ingredients', async () => {
    catalogService.findRange.mockResolvedValue({
      docs: [
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
      ],
      totalDocs: 1,
    });

    const result = await service.findAll(
      user,
      tenantReadQuery(VoicesQueryDto, {
        isActive: true,
        limit: 12,
        page: 1,
      }),
    );

    expect(catalogService.findRange).toHaveBeenCalledWith({
      isActive: true,
      providers: expect.arrayContaining(['ELEVENLABS', 'HEYGEN']),
      search: undefined,
      skip: 0,
      take: 12,
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

  const catalogRow = (id: string) => ({
    createdAt: new Date('2026-01-01'),
    externalId: id,
    externalProvider: DbVoiceProvider.ELEVENLABS,
    id,
    isActive: true,
    isDefaultSelectable: true,
    isFeatured: false,
    language: null,
    name: id,
    providerData: {},
    sampleAudioUrl: null,
    updatedAt: new Date('2026-01-02'),
  });

  it('lists the catalog after the org voices instead of hiding it', async () => {
    voicesService.findAll.mockResolvedValue({
      docs: [{ id: 'cloned-1', isCloned: true }],
      totalDocs: 1,
    });
    catalogService.findRange.mockResolvedValue({
      docs: [catalogRow('c-1'), catalogRow('c-2')],
      totalDocs: 20,
    });

    const result = await service.findAll(
      user,
      tenantReadQuery(VoicesQueryDto, { limit: 3, page: 1 }),
    );

    expect(catalogService.findRange).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 2 }),
    );
    expect(result.docs.map((doc) => doc.id)).toEqual([
      'cloned-1',
      'c-1',
      'c-2',
    ]);
    expect(result).toMatchObject({
      hasNextPage: true,
      page: 1,
      totalDocs: 21,
      totalPages: 7,
    });
  });

  it('continues into the catalog once the org voices run out', async () => {
    voicesService.findAll.mockResolvedValue({ docs: [], totalDocs: 1 });
    catalogService.findRange.mockResolvedValue({
      docs: [catalogRow('c-3'), catalogRow('c-4'), catalogRow('c-5')],
      totalDocs: 20,
    });

    const result = await service.findAll(
      user,
      tenantReadQuery(VoicesQueryDto, { limit: 3, page: 2 }),
    );

    // Offset 3 into the combined list; one org voice came first.
    expect(catalogService.findRange).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 3 }),
    );
    expect(result).toMatchObject({
      hasPrevPage: true,
      page: 2,
      pagingCounter: 4,
      totalDocs: 21,
    });
    expect(result.docs).toHaveLength(3);
  });

  it('reports the last page without a next page', async () => {
    voicesService.findAll.mockResolvedValue({ docs: [], totalDocs: 0 });
    catalogService.findRange.mockResolvedValue({
      docs: [catalogRow('c-13'), catalogRow('c-14')],
      totalDocs: 14,
    });

    const result = await service.findAll(
      user,
      tenantReadQuery(VoicesQueryDto, { limit: 12, page: 2 }),
    );

    expect(catalogService.findRange).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 12, take: 12 }),
    );
    expect(result).toMatchObject({
      hasNextPage: false,
      hasPrevPage: true,
      page: 2,
      pagingCounter: 13,
      totalDocs: 14,
      totalPages: 2,
    });
  });
});
