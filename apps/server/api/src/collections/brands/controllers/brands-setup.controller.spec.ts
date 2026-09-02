import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsSetupController } from '@api/collections/brands/controllers/brands-setup.controller';
import type { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import type { BrandWebsitePreviewService } from '@api/collections/brands/services/brand-website-preview.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('BrandsSetupController', () => {
  const brandId = 'cmbrand000000000000000001';
  const mockUser = {
    id: 'user-123',
    organizationId: 'cmorganization000000000000001',
    userId: 'cmuser0000000000000000001',
  } as unknown as User;

  let brandSetupService: {
    addReferenceImages: ReturnType<typeof vi.fn>;
    setupBrand: ReturnType<typeof vi.fn>;
  };
  let brandWebsitePreviewService: {
    previewWebsite: ReturnType<typeof vi.fn>;
  };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let controller: BrandsSetupController;
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    brandSetupService = {
      addReferenceImages: vi.fn(),
      setupBrand: vi.fn(),
    };
    brandWebsitePreviewService = {
      previewWebsite: vi.fn(),
    };
    brandsService = {
      findOne: vi.fn().mockResolvedValue({ id: brandId }),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    controller = new BrandsSetupController(
      brandsService as unknown as BrandsService,
      brandSetupService as unknown as BrandSetupService,
      brandWebsitePreviewService as unknown as BrandWebsitePreviewService,
      loggerService as unknown as LoggerService,
    );
  });

  it('delegates website preview mapping to the preview service', async () => {
    const preview = {
      data: {
        label: 'Acme',
        slug: 'acme',
        sourceUrl: 'https://acme.com',
        websiteUrl: 'https://acme.com',
      },
    };
    brandWebsitePreviewService.previewWebsite.mockResolvedValue(preview);

    await expect(
      controller.previewWebsite({ websiteUrl: 'https://acme.com' }),
    ).resolves.toEqual(preview);

    expect(brandWebsitePreviewService.previewWebsite).toHaveBeenCalledWith(
      'https://acme.com',
    );
    expect(loggerService.log).toHaveBeenCalledWith(
      'BrandsSetupController.previewWebsite started',
      expect.objectContaining({ operation: 'previewWebsite' }),
    );
  });

  it('verifies brand access before delegating scrape orchestration', async () => {
    const dto = { brandUrl: 'https://acme.com' };
    const setupResult = { brandId, success: true };
    brandSetupService.setupBrand.mockResolvedValue(setupResult);

    await expect(
      controller.scrapeBrand(mockUser, brandId, dto),
    ).resolves.toEqual(setupResult);

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: brandId,
      OR: [
        { userId: mockUser.userId },
        { organizationId: mockUser.organizationId },
      ],
    });
    expect(brandSetupService.setupBrand).toHaveBeenCalledWith(
      brandId,
      dto,
      mockUser,
    );
  });

  it('verifies brand access before delegating reference image orchestration', async () => {
    const images: never[] = [];
    const addResult = { count: 0, success: true };
    brandSetupService.addReferenceImages.mockResolvedValue(addResult);

    await expect(
      controller.addReferenceImages(mockUser, brandId, { images }),
    ).resolves.toEqual(addResult);

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: brandId,
      OR: [
        { userId: mockUser.userId },
        { organizationId: mockUser.organizationId },
      ],
    });
    expect(brandSetupService.addReferenceImages).toHaveBeenCalledWith(
      brandId,
      images,
      mockUser,
    );
  });

  it('does not run setup orchestration when brand access is denied', async () => {
    brandsService.findOne.mockResolvedValue(null);

    await expect(
      controller.scrapeBrand(mockUser, brandId, {
        brandUrl: 'https://acme.com',
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(brandSetupService.setupBrand).not.toHaveBeenCalled();
  });
});
