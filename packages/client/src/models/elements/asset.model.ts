import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { AssetCategory, AssetParent } from '@genfeedai/contracts';
import type { IAsset, IUser } from '@genfeedai/contracts/interfaces';

export class Asset extends BaseEntity implements IAsset {
  declare public userId: string;
  declare public user?: IUser;
  declare public parentType: AssetParent;
  declare public parentOrgId?: string | null;
  declare public parentBrandId?: string | null;
  declare public parentIngredientId?: string | null;
  declare public parentArticleId?: string | null;
  declare public category: AssetCategory;
  declare public url: string;

  declare public mimeType?: string;
  declare public size?: number;
  declare public width?: number;
  declare public height?: number;
  declare public isDefault?: boolean;

  constructor(data: Partial<IAsset> = {}) {
    super(data);
  }
}
