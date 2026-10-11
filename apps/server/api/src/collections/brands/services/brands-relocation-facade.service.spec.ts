import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';

describe('BrandsService relocation facade', () => {
  const brand = { id: 'brand-1' } as BrandDocument;
  const summary = {
    membersSevered: 0,
    personaGrantsRevoked: 0,
    schedulesHeld: 0,
    schedulingPending: 0,
    workflowsMoved: 0,
  };
  let patch: ReturnType<typeof vi.fn>;
  let relocationService: {
    previewRelocation: ReturnType<typeof vi.fn>;
    relocateToOrganization: ReturnType<typeof vi.fn>;
  };
  let service: BrandsService;

  beforeEach(() => {
    patch = vi.fn().mockResolvedValue(brand);
    relocationService = {
      previewRelocation: vi.fn(),
      relocateToOrganization: vi.fn(),
    };
    service = Object.assign(
      Object.create(BrandsService.prototype) as BrandsService,
      {
        brandRelocationService:
          relocationService as unknown as BrandRelocationService,
        patch,
      },
    );
  });

  it('delegates relocation and preserves the normal patch callback', async () => {
    relocationService.relocateToOrganization.mockImplementation(
      async (
        _brandId: string,
        _dto: unknown,
        _actingUser: unknown,
        patchSameOrganization: (updates: {
          label?: string;
        }) => Promise<BrandDocument>,
      ) => ({
        brand: await patchSameOrganization({ label: 'Renamed' }),
        summary,
      }),
    );

    await expect(
      service.relocateToOrganization(
        'brand-1',
        { organizationId: 'org-1' },
        { isSuperAdmin: true, userId: 'user-1' },
      ),
    ).resolves.toEqual({ brand, summary });
    expect(patch).toHaveBeenCalledWith('brand-1', { label: 'Renamed' });
  });

  it('delegates relocation preview unchanged', async () => {
    const preview = {
      counts: {
        schedulesToHold: 0,
        soleBrandWorkflows: 1,
        staleMembers: 0,
      },
      movingResources: [],
      schedulesToHold: [],
    };
    relocationService.previewRelocation.mockResolvedValue(preview);

    await expect(
      service.previewRelocation('brand-1', 'org-2', {
        isSuperAdmin: true,
        userId: 'user-1',
      }),
    ).resolves.toBe(preview);
  });
  it('hands the acting key scopes to the relocation unchanged', async () => {
    relocationService.relocateToOrganization.mockResolvedValue({
      brand,
      summary,
    });
    const actingUser = {
      isApiKey: true,
      isSuperAdmin: false,
      scopes: ['admin'],
      userId: 'user-1',
    };

    await service.relocateToOrganization(
      'brand-1',
      { organizationId: 'org-1' },
      actingUser,
    );

    expect(relocationService.relocateToOrganization).toHaveBeenCalledWith(
      'brand-1',
      { organizationId: 'org-1' },
      actingUser,
      expect.any(Function),
    );
  });

  it('same-org source fields remain on the existing facade patch callback without forwarding a tenant retarget', async () => {
    relocationService.relocateToOrganization.mockImplementation(
      async (_id, _dto, _user, patchSameOrganization) => ({
        brand: await patchSameOrganization({ isActive: false }),
        summary,
      }),
    );
    await service.relocateToOrganization(
      'brand-1',
      { organizationId: 'org-1', isActive: false },
      { isSuperAdmin: true, userId: 'user-1' },
    );
    expect(patch).toHaveBeenCalledWith('brand-1', { isActive: false });
    expect(patch.mock.calls[0][1]).not.toHaveProperty('organizationId');
  });
});
