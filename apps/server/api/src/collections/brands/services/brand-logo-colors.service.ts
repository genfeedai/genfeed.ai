import { extractBrandLogoColors } from '@api/collections/brands/utils/brand-logo-colors.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { decodeBrandImage } from '@api/services/brand-validation/brand-validation-pixels.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetCategory, AssetParent, BrandKitSlot } from '@genfeedai/contracts';
import type { IBrandKitLogoColor } from '@genfeedai/contracts/interfaces';
import { assertSafeObjectKey, createStorageProvider } from '@genfeedai/storage';
import { Traced } from '@libs/tracing/traced';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';

/** A logo larger than this is not read for colors. */
const LOGO_READ_MAX_BYTES = 20 * 1024 * 1024;
const LOGO_READ_TIMEOUT_MS = 15_000;

/**
 * Suggests palette colors from the brand's primary logo (#9709). The owner
 * picks which ones to keep; nothing is saved here.
 */
@Traced()
@Injectable()
export class BrandLogoColorsService {
  private readonly storage = createStorageProvider();

  constructor(private readonly prisma: PrismaService) {}

  async fromPrimaryLogo(
    brandId: string,
    organizationId: string,
  ): Promise<IBrandKitLogoColor[]> {
    const logo = await this.prisma.asset.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { cloudObjectKey: true, id: true },
      where: {
        category: AssetCategory.LOGO,
        isDeleted: false,
        OR: [{ kitSlot: BrandKitSlot.LOGO_PRIMARY }, { kitSlot: null }],
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: AssetParent.BRAND,
      },
    });
    if (!logo) throw new NotFoundException('Primary logo', brandId);
    const key = logo.cloudObjectKey?.trim() || `logos/${logo.id}`;
    let bytes: Buffer;
    try {
      assertSafeObjectKey(key, () => new Error('brand_logo_unreadable'));
      bytes = await this.storage.readBytes(key, {
        maxBytes: LOGO_READ_MAX_BYTES,
        timeoutMs: LOGO_READ_TIMEOUT_MS,
      });
    } catch {
      throw new UnprocessableEntityException('brand_logo_unreadable');
    }
    const decoded = await decodeBrandImage(bytes);
    const frame = decoded?.frames[0];
    if (!frame) throw new UnprocessableEntityException('brand_logo_unreadable');
    return extractBrandLogoColors(frame);
  }
}
