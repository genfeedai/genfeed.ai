import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';

describe('BrandsService relocation facade', () => {
  const brand = { id: 'brand-1' } as BrandDocument;
  const summary = {
    membersSevered: 0,
    schedulingPending: 0,
    workflowsClonedActive: 0,
    workflowsClonedPaused: 0,
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
      ackToken: null,
      counts: {
        sharedWorkflows: 0,
        soleBrandWorkflows: 1,
        staleMembers: 0,
      },
      movingResources: [],
    };
    relocationService.previewRelocation.mockResolvedValue(preview);

    await expect(
      service.previewRelocation('brand-1', 'org-2', {
        isSuperAdmin: true,
        userId: 'user-1',
      }),
    ).resolves.toBe(preview);
  });
});
