import { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@api/collections/assets/dto/update-asset.dto';
import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AssetsService extends BaseService<
  AssetDocument,
  CreateAssetDto,
  UpdateAssetDto
> {
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'asset', logger);
  }
}
