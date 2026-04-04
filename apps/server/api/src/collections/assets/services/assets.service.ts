import type { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import type { UpdateAssetDto } from '@api/collections/assets/dto/update-asset.dto';
import {
  Asset,
  type AssetDocument,
} from '@api/collections/assets/schemas/asset.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class AssetsService extends BaseService<
  AssetDocument,
  CreateAssetDto,
  UpdateAssetDto
> {
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(Asset.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<AssetDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
