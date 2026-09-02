import type { AssetCategory, AssetParent } from '../..';
import type { IBaseEntity } from '../core/base.interface';
import type { IUser } from '../users/user.interface';

export interface IAsset extends IBaseEntity {
  userId: string;
  user?: IUser;
  parentType: AssetParent;
  parentOrgId?: string | null;
  parentBrandId?: string | null;
  parentIngredientId?: string | null;
  parentArticleId?: string | null;
  category: AssetCategory;
  url: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  isDefault?: boolean;
  isDeleted: boolean;
}
