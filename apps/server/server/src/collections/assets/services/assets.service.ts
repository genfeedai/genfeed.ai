import { AssetParent } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { CreateAssetDto } from '@server/collections/assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@server/collections/assets/dto/update-asset.dto';
import type { AssetDocument } from '@server/collections/assets/schemas/asset.schema';
import { buildAssetParentColumns } from '@server/collections/assets/utils/asset-parent.util';
import { ValidationException } from '@server/exceptions/validation.exception';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { BaseService } from '@server/shared/services/base/base.service';

type AssetCreateInput = CreateAssetDto & { userId: string };

@Injectable()
export class AssetsService extends BaseService<
  AssetDocument,
  AssetCreateInput,
  UpdateAssetDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'asset', logger);
  }

  protected override normalizeData(data: unknown) {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return super.normalizeData(data);
    }

    const normalized = { ...(data as Record<string, unknown>) };
    const parentId = normalized.parentId;
    const parentType = normalized.parentType;

    if (parentId !== undefined) {
      if (typeof parentId !== 'string') {
        throw new ValidationException('parentId must be a string');
      }
      if (
        typeof parentType !== 'string' ||
        !Object.values(AssetParent).includes(parentType as AssetParent)
      ) {
        throw new ValidationException(
          'parentType is required when parentId is provided',
        );
      }

      delete normalized.parentId;
      Object.assign(
        normalized,
        buildAssetParentColumns(parentType as AssetParent, parentId),
      );
    }

    return super.normalizeData(normalized);
  }
}
