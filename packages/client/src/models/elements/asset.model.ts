import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { AssetCategory, AssetParent } from '@genfeedai/enums';
import type { IAsset, IUser } from '@genfeedai/interfaces';

export class Asset extends BaseEntity implements IAsset {
  public declare user: IUser;
  public declare parent: string;
  public declare parentModel: AssetParent;
  public declare category: AssetCategory;
  public declare url: string;

  public declare mimeType?: string;
  public declare size?: number;
  public declare width?: number;
  public declare height?: number;
  public declare brand?: string;
  public declare isDefault?: boolean;

  constructor(data: Partial<IAsset> = {}) {
    super(data);
  }
}
