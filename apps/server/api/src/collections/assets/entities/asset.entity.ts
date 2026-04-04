import type { Asset } from '@api/collections/assets/schemas/asset.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { AssetCategory, AssetParent } from '@genfeedai/enums';
import type { Types } from 'mongoose';

export class AssetEntity extends BaseEntity implements Asset {
  declare readonly user: Types.ObjectId;
  declare readonly parent?: Types.ObjectId;
  declare readonly parentModel: AssetParent;

  declare readonly category: AssetCategory;
}
