import { AssetCategory, AssetParent } from '@genfeedai/enums';
import type { IBaseEntity } from '../core/base.interface';
import type { IUser } from '../users/user.interface';

export interface IAsset extends IBaseEntity {
  user: IUser;
  parent: string;
  parentModel: AssetParent;
  category: AssetCategory;
  url: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  brand?: string;
  isDefault?: boolean;
  isDeleted: boolean;
}
