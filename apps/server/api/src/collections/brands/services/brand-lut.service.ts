import { randomUUID } from 'node:crypto';
import {
  normalizeBrandLutFileName,
  parseBrandCubeLut,
} from '@api/collections/brands/utils/brand-lut.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { assertSafeObjectKey, createStorageProvider } from '@genfeedai/storage';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * The `.cube` colour LUT a brand grades its finished videos with. The stored
 * object key stays on the brand row; only the files worker and the stitch plan
 * read it, so no request can point a brand at a key of its own choosing.
 */
@Injectable()
export class BrandLutService {
  private readonly storage = createStorageProvider();
  private readonly logger = new Logger(BrandLutService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upload(
    brandId: string,
    organizationId: string,
    file: Pick<Express.Multer.File, 'buffer' | 'originalname'>,
  ): Promise<void> {
    const lutFileName = normalizeBrandLutFileName(file.originalname);
    parseBrandCubeLut(file.buffer);

    const brand = await this.findBrand(brandId, organizationId);
    const key = assertSafeObjectKey(
      `brand-luts/${organizationId}/${brandId}/${randomUUID()}.cube`,
      () => new BadRequestException('The LUT could not be stored'),
    );
    try {
      await this.storage.upload(file.buffer, key, 'application/octet-stream');
    } catch {
      throw new ServiceUnavailableException('The LUT could not be stored');
    }

    const { count } = await this.prisma.brand.updateMany({
      data: { lutFileName, lutStorageKey: key },
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (count === 0) {
      await this.deleteObject(key);
      throw new NotFoundException('Brand', brandId);
    }
    if (brand.lutStorageKey) await this.deleteObject(brand.lutStorageKey);
  }

  async remove(brandId: string, organizationId: string): Promise<void> {
    const brand = await this.findBrand(brandId, organizationId);
    await this.prisma.brand.updateMany({
      data: { isLutEnabled: false, lutFileName: null, lutStorageKey: null },
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (brand.lutStorageKey) await this.deleteObject(brand.lutStorageKey);
  }

  private async findBrand(brandId: string, organizationId: string) {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true, lutStorageKey: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (!brand) throw new NotFoundException('Brand', brandId);
    return brand;
  }

  private async deleteObject(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn('brand_lut_cleanup_failed');
    }
  }
}
