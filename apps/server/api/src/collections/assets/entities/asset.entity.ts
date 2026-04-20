import type { Asset } from '@api/collections/assets/schemas/asset.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { AssetCategory, AssetParent } from '@genfeedai/enums';

export class AssetEntity extends BaseEntity implements Asset {
  declare readonly user: string;
  declare readonly parent?: string;
  declare readonly parentModel: AssetParent;

  declare readonly category: AssetCategory;
}
