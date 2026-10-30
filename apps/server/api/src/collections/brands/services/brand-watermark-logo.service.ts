import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BRAND_END_CARD_MIME_TYPES } from '@genfeedai/contracts/constants';
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

  /** Checks every brand kit asset an update points the brand at. */
  async validateKitSettings(
    brandId: string,
    organizationId: string,
    update: {
      endCardAssetId?: string | null;
      isEndCardEnabled?: boolean;
      isLutEnabled?: boolean;
      watermarkLightLogoId?: string | null;
      watermarkLiveLogoId?: string | null;
      watermarkLogoId?: string | null;
    },
  ): Promise<void> {
    for (const logoId of [
      update.watermarkLogoId,
      update.watermarkLightLogoId,
      update.watermarkLiveLogoId,
    ]) {
      if (logoId) {
        await this.validateWatermarkLogo(brandId, organizationId, logoId);
      }
    }
    await this.validateEndCardSettings(brandId, organizationId, update);
    await this.validateLutSettings(brandId, organizationId, update);
  }

  /** Turning the grade on needs a LUT uploaded to this brand first. */
  async validateLutSettings(
    brandId: string,
    organizationId: string,
    update: { isLutEnabled?: boolean },
  ): Promise<void> {
    if (!update.isLutEnabled) return;
    const brand = await this.prisma.brand.findFirst({
      select: { lutStorageKey: true },
      where: { id: brandId, organizationId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Brand', brandId);
    if (!brand.lutStorageKey)
      throw new BadRequestException(
        'Upload a .cube LUT before turning the colour grade on',
      );
  }

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
    if (!logo?.mimeType?.startsWith('image/'))
      throw new BadRequestException(
        'The watermark logo must be an image belonging to this brand',
      );
  }

  /**
   * An end card turned on needs a still image from this brand's own kit. The
   * brand's stored values fill whichever of the two the update leaves out.
   */
  async validateEndCardSettings(
    brandId: string,
    organizationId: string,
    update: { endCardAssetId?: string | null; isEndCardEnabled?: boolean },
  ): Promise<void> {
    if (
      update.endCardAssetId === undefined &&
      update.isEndCardEnabled === undefined
    )
      return;
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, organizationId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Brand', brandId);
    const assetId =
      update.endCardAssetId !== undefined
        ? update.endCardAssetId
        : brand.endCardAssetId;
    const isEnabled = update.isEndCardEnabled ?? brand.isEndCardEnabled;
    if (!assetId) {
      if (isEnabled)
        throw new BadRequestException(
          'Choose an end card image before turning the end card on',
        );
      return;
    }
    // A disabled card keeps its stored image; only a new image needs a check.
    if (!isEnabled && assetId === brand.endCardAssetId) return;
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        parentOrgId: organizationId,
        parentBrandId: brandId,
        parentType: 'BRAND',
        isDeleted: false,
      },
    });
    if (!BRAND_END_CARD_MIME_TYPES.includes(asset?.mimeType ?? ''))
      throw new BadRequestException(
        'The end card must be a PNG, JPEG or WebP image belonging to this brand',
      );
  }
}
