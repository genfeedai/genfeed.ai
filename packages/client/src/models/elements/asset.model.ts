import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { AssetCategory, AssetParent } from '@genfeedai/contracts';
import type { IAsset, IUser } from '@genfeedai/contracts/interfaces';

export class Asset extends BaseEntity implements IAsset {
  public declare userId: string;
  public declare user?: IUser;
  public declare parentType: AssetParent;
  public declare parentOrgId?: string | null;
  public declare parentBrandId?: string | null;
  public declare parentIngredientId?: string | null;
  public declare parentArticleId?: string | null;
  public declare category: AssetCategory;
  public declare url: string;

  public declare mimeType?: string;
  public declare size?: number;
  public declare width?: number;
  public declare height?: number;
  public declare isDefault?: boolean;

  constructor(data: Partial<IAsset> = {}) {
    super(data);
  }
}
