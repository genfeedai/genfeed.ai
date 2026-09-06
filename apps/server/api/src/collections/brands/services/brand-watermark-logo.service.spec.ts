import { NotFoundException } from '@api/exceptions/not-found.exception';

// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.Brand via the light
// @genfeedai/prisma/testing subpath — no heavy PrismaClient/runtime import
// required.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BrandWatermarkLogoService } from '@api/collections/brands/services/brand-watermark-logo.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('BrandWatermarkLogoService', () => {
  let service: BrandWatermarkLogoService;
  let delegate: Record<string, ReturnType<typeof vi.fn>>;
  let assetDelegate: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    delegate = {
      findFirst: vi.fn(),
    };
    assetDelegate = {
      findFirst: vi.fn(),
    };

    const prisma = {
      asset: assetDelegate,
      brand: delegate,
    } as unknown as PrismaService;

    service = new BrandWatermarkLogoService(prisma);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validateWatermarkLogo', () => {
    it('rejects watermark logos outside the current brand', async () => {
      delegate.findFirst.mockResolvedValue({
        id: 'brand-1',
        organizationId: 'org-1',
      });
      assetDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.validateWatermarkLogo('brand-1', 'org-1', 'other-logo'),
      ).rejects.toThrow(BadRequestException);
      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: 'brand-1', organizationId: 'org-1', isDeleted: false },
      });
      expect(assetDelegate.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'other-logo',
          parentOrgId: 'org-1',
          parentBrandId: 'brand-1',
          parentType: 'BRAND',
          isDeleted: false,
        },
      });
    });

    it('rejects when the brand does not exist', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await expect(
        service.validateWatermarkLogo('brand-1', 'org-1', 'logo-1'),
      ).rejects.toThrow(NotFoundException);
      expect(assetDelegate.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a non-image asset as the watermark logo', async () => {
      delegate.findFirst.mockResolvedValue({
        id: 'brand-1',
        organizationId: 'org-1',
      });
      assetDelegate.findFirst.mockResolvedValue({
        id: 'logo-1',
        mimeType: 'application/pdf',
      });

      await expect(
        service.validateWatermarkLogo('brand-1', 'org-1', 'logo-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid image logo belonging to the brand', async () => {
      delegate.findFirst.mockResolvedValue({
        id: 'brand-1',
        organizationId: 'org-1',
      });
      assetDelegate.findFirst.mockResolvedValue({
        id: 'logo-1',
        mimeType: 'image/png',
      });

      await expect(
        service.validateWatermarkLogo('brand-1', 'org-1', 'logo-1'),
      ).resolves.toBeUndefined();
    });
  });
});
