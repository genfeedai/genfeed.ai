import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Validates a brand's chosen watermark logo asset before it is persisted onto
 * the brand record. Split out of BrandsService (#4501) so watermark/export
 * concerns do not keep growing the core brand CRUD service past the file-lines
 * ratchet.
 */
@Injectable()
export class BrandWatermarkLogoService {
  constructor(private readonly prisma: PrismaService) {}

  async validateWatermarkLogo(
    brandId: string,
    organizationId: string,
    logoId: string,
  ): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, organizationId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Brand', brandId);
    const logo = await this.prisma.asset.findFirst({
      where: {
        id: logoId,
        parentOrgId: organizationId,
        parentBrandId: brandId,
        parentType: 'BRAND',
        isDeleted: false,
      },
    });
    if (!logo || (logo.mimeType && !logo.mimeType.startsWith('image/')))
      throw new BadRequestException(
        'The watermark logo must be an image belonging to this brand',
      );
  }
}
