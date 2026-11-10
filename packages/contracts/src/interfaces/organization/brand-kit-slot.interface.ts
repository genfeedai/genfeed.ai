import type { AssetCategory, BrandKitSlot } from '../../enums/asset.enum';

/** What a platform image slot holds on its platform. */
export type BrandKitPlatformImageKind = 'banner' | 'profile';

export type BrandKitSlotPlatform = 'x' | 'youtube' | 'linkedin' | 'facebook';

/** A centered rectangle that stays visible on every device, in output pixels. */
export interface IBrandKitSafeArea {
  width: number;
  height: number;
}

export interface IBrandKitLogoSlotSpec {
  slot: BrandKitSlot;
  category: AssetCategory.LOGO;
  /** The background a variant is drawn for, used to pick a logo per render. */
  background?: 'light' | 'dark';
}

export interface IBrandKitPlatformSlotSpec {
  slot: BrandKitSlot;
  category: AssetCategory.BANNER;
  kind: BrandKitPlatformImageKind;
  /** Absent for the master banner, which is not tied to one platform. */
  platform?: BrandKitSlotPlatform;
  /** Recommended upload size. Uploads are cropped to this ratio. */
  width: number;
  height: number;
  /** Smallest size the platform accepts. Defaults to the recommended size. */
  minWidth?: number;
  minHeight?: number;
  safeArea?: IBrandKitSafeArea;
  /** The platform's own help page the size was read from. */
  sourceUrl?: string;
}
