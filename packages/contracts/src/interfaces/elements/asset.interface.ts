import type { AssetCategory, AssetParent, BrandKitSlot } from '../..';
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
  /** Logo variant or platform image slot; null on rows written before slots. */
  kitSlot?: BrandKitSlot | null;
  url: string;
  /** Absolute delivery URL, resolved server-side from the stored object key. */
  cdnUrl?: string;
  mimeType?: string;
  /** The uploaded file's format (svg, png, jpeg, webp, gif). */
  originalFormat?: string | null;
  originalWidth?: number | null;
  originalHeight?: number | null;
  size?: number;
  width?: number;
  height?: number;
  isDefault?: boolean;
  isDeleted: boolean;
}
