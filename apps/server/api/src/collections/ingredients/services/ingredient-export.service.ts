import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IIngredientExportResult,
  IWatermarkLayer,
  WatermarkPosition,
} from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const POSITIONS: readonly string[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];
@Injectable()
export class IngredientExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesClientService,
  ) {}

  async export(
    ingredientId: string,
    organizationId: string,
    watermark: boolean,
  ): Promise<IIngredientExportResult & { id: string }> {
    if (!watermark)
      throw new ForbiddenException(
        'This endpoint only creates watermarked previews',
      );
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, organizationId, isDeleted: false },
      include: { metadata: true },
    });
    if (!ingredient) throw new NotFoundException('Ingredient');
    const category =
      ingredient.category === 'IMAGE' || ingredient.category === 'IMAGE_EDIT'
        ? 'images'
        : ingredient.category === 'VIDEO' ||
            ingredient.category === 'VIDEO_EDIT'
          ? 'videos'
          : undefined;
    if (!category)
      throw new BadRequestException(
        'Only images and videos support watermark exports',
      );
    if (!ingredient.s3Key?.trim())
      throw new BadRequestException(
        'The original must be stored before creating a preview',
      );
    const filename = `${ingredient.id}${watermark ? '-watermarked' : ''}.${category === 'videos' ? 'mp4' : 'png'}`;
    if (!ingredient.brandId)
      throw new BadRequestException(
        'Assign a brand before exporting a watermark',
      );
    const brand = await this.prisma.brand.findFirst({
      where: { id: ingredient.brandId, organizationId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Brand');
    const text = brand.watermarkText?.trim();
    let logoStorageKey: string | undefined;
    if (brand.watermarkLogoId) {
      const logo = await this.prisma.asset.findFirst({
        where: {
          id: brand.watermarkLogoId,
          parentOrgId: organizationId,
          parentBrandId: brand.id,
          parentType: 'BRAND',
          isDeleted: false,
        },
      });
      if (!logo || (logo.mimeType && !logo.mimeType.startsWith('image/')))
        throw new BadRequestException(
          'The watermark logo must be an image belonging to this brand',
        );
      logoStorageKey =
        logo.cloudObjectKey ??
        (logo.category === 'LOGO' ? `logos/${logo.id}` : undefined);
      if (!logoStorageKey)
        throw new BadRequestException(
          'The watermark logo must be uploaded first',
        );
    }
    if (!text && !logoStorageKey)
      throw new BadRequestException(
        'Configure a watermark in brand settings first',
      );
    if (
      !POSITIONS.includes(brand.watermarkPosition) ||
      brand.watermarkOpacity < 0.05 ||
      brand.watermarkOpacity > 1
    )
      throw new BadRequestException('Invalid brand watermark settings');
    const layer: IWatermarkLayer = {
      text: text || undefined,
      logoStorageKey,
      opacity: brand.watermarkOpacity,
      position: brand.watermarkPosition as WatermarkPosition,
    };
    const result = await this.files.watermarkExport({
      storageKey: ingredient.s3Key,
      category,
      layers: [layer],
    });
    return { id: ingredient.id, url: result.url, filename };
  }
}
