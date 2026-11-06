import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsSetupController } from '@api/collections/brands/controllers/brands-setup.controller';
import type { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import type { BrandWebsitePreviewService } from '@api/collections/brands/services/brand-website-preview.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { LoggerService } from '@libs/logger/logger.service';

interface BrandRow {
  id: string;
  isDeleted: boolean;
  organizationId: string;
  userId: string;
}

describe('BrandsSetupController', () => {
  const brandId = 'cmbrand000000000000000001';
  const organizationId = 'cmorganization000000000000001';
  const mockUser = {
    id: 'user-123',
    organizationId,
    userId: 'cmuser0000000000000000001',
  } as unknown as User;

  let brands: BrandRow[];
  let setupRuns: Array<{ brandId: string; dto: unknown; user: User }>;
  let referenceImageRuns: Array<{
    brandId: string;
    images: unknown;
    user: User;
  }>;
  let previewedUrls: string[];
  let logs: Array<{ context: unknown; message: string }>;
  let controller: BrandsSetupController;

  // Emulates the database `where`, `OR` included, so a scope that is too
  // broad (e.g. userId-or-org) would resolve a foreign row.
  const matchesWhere = (
    row: BrandRow,
    where: Record<string, unknown>,
  ): boolean =>
    Object.entries(where).every(([key, value]) =>
      key === 'OR'
        ? (value as Record<string, unknown>[]).some((branch) =>
            matchesWhere(row, branch),
          )
        : key === 'AND'
          ? (value as Record<string, unknown>[]).every((branch) =>
              matchesWhere(row, branch),
            )
          : (row as unknown as Record<string, unknown>)[key] === value,
    );

  beforeEach(() => {
    brands = [
      {
        id: brandId,
        isDeleted: false,
        organizationId,
        userId: mockUser.userId,
      },
    ];
    setupRuns = [];
    referenceImageRuns = [];
    previewedUrls = [];
    logs = [];

    const brandsService = {
      findOne: async (where: Record<string, unknown>) =>
        brands.find((row) => matchesWhere(row, where)) ?? null,
    };
    const brandSetupService = {
      addReferenceImages: async (id: string, images: unknown, user: User) => {
        referenceImageRuns.push({ brandId: id, images, user });
        return { count: 0, success: true };
      },
      setupBrand: async (id: string, dto: unknown, user: User) => {
        setupRuns.push({ brandId: id, dto, user });
        return { brandId: id, success: true };
      },
    };
    const brandWebsitePreviewService = {
      previewWebsite: async (websiteUrl: string) => {
        previewedUrls.push(websiteUrl);
        return {
          data: {
            label: 'Acme',
            slug: 'acme',
            sourceUrl: websiteUrl,
            websiteUrl,
          },
        };
      },
    };
    const loggerService = {
      error: (message: string, context: unknown) => {
        logs.push({ context, message });
      },
      log: (message: string, context: unknown) => {
        logs.push({ context, message });
      },
    };

    controller = new BrandsSetupController(
      brandsService as unknown as BrandsService,
      brandSetupService as unknown as BrandSetupService,
      brandWebsitePreviewService as unknown as BrandWebsitePreviewService,
      loggerService as unknown as LoggerService,
    );
  });

  it('returns the website preview for the requested URL', async () => {
    await expect(
      controller.previewWebsite({ websiteUrl: 'https://acme.com' }),
    ).resolves.toEqual({
      data: {
        label: 'Acme',
        slug: 'acme',
        sourceUrl: 'https://acme.com',
        websiteUrl: 'https://acme.com',
      },
    });

    expect(previewedUrls).toEqual(['https://acme.com']);
    expect(logs).toContainEqual({
      context: expect.objectContaining({ operation: 'previewWebsite' }),
      message: 'BrandsSetupController.previewWebsite started',
    });
  });

  it('runs scrape setup for a brand in the caller organization', async () => {
    const dto = { brandUrl: 'https://acme.com' };

    await expect(
      controller.scrapeBrand(mockUser, brandId, dto),
    ).resolves.toEqual({ brandId, success: true });

    expect(setupRuns).toEqual([{ brandId, dto, user: mockUser }]);
  });

  it('adds reference images to a brand in the caller organization', async () => {
    await expect(
      controller.addReferenceImages(mockUser, brandId, { images: [] }),
    ).resolves.toEqual({ count: 0, success: true });

    expect(referenceImageRuns).toEqual([
      { brandId, images: [], user: mockUser },
    ]);
  });

  it('does not run setup for a soft-deleted brand', async () => {
    brands[0] = { ...brands[0], isDeleted: true } as BrandRow;

    await expect(
      controller.scrapeBrand(mockUser, brandId, {
        brandUrl: 'https://acme.com',
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(setupRuns).toEqual([]);
  });

  it('does not run setup for an unknown brand', async () => {
    brands = [];

    await expect(
      controller.scrapeBrand(mockUser, brandId, {
        brandUrl: 'https://acme.com',
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(setupRuns).toEqual([]);
  });

  it('does not touch a brand the caller created in another organization', async () => {
    // The lookup is session-org scoped, so a brand the caller created in
    // another organization never resolves.
    brands = [
      {
        id: brandId,
        isDeleted: false,
        organizationId: 'cmorganization000000000000002',
        userId: mockUser.userId,
      },
    ];

    await expect(
      controller.scrapeBrand(mockUser, brandId, {
        brandUrl: 'https://acme.com',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      controller.addReferenceImages(mockUser, brandId, { images: [] }),
    ).rejects.toMatchObject({ status: 404 });

    expect(setupRuns).toEqual([]);
    expect(referenceImageRuns).toEqual([]);
  });
});
