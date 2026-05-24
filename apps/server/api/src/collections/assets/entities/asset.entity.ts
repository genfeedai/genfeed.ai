import type { Asset } from '@api/collections/assets/schemas/asset.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { AssetParent } from '@genfeedai/enums';

export class AssetEntity extends BaseEntity implements Asset {
  declare readonly id: string;
  declare readonly mongoId: string | null;
  declare readonly userId: string;
  declare readonly parentType: Asset['parentType'];
  declare readonly parentOrgId: string | null;
  declare readonly parentBrandId: string | null;
  declare readonly parentIngredientId: string | null;
  declare readonly parentArticleId: string | null;
  declare readonly externalId: string | null;
  declare readonly user: string;
  declare readonly parent?: string;
  declare readonly parentModel: AssetParent;

  declare readonly category: Asset['category'];
  declare readonly localAssetId: string | null;
  declare readonly cloudObjectKey: string | null;
  declare readonly sha256: string | null;
  declare readonly sizeBytes: number | null;
  declare readonly mimeType: string | null;
  declare readonly kind: string | null;
  declare readonly origin: string | null;
  declare readonly residency: string | null;
  declare readonly uploadPolicy: string | null;
  declare readonly originalFileName: string | null;
  declare readonly displayName: string | null;
  declare readonly deletedAt: Date | null;
}
