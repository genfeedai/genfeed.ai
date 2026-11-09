import type { BrandKitSlot } from '@genfeedai/contracts';
import type { BrandLogoDownloadFormat } from '@genfeedai/contracts/constants';
import type {
  IAsset,
  IBrand,
  IBrandKitLogoSlotSpec,
  IBrandKitPlatformSlotSpec,
} from '@genfeedai/contracts/interfaces';

export interface BrandKitSlotsCardProps {
  brand: IBrand;
  brandId: string;
  isManager: boolean;
  onUpload: (slot: BrandKitSlot) => void;
  onRefreshBrand: () => Promise<void>;
}

export interface BrandKitSlotTileProps {
  spec: IBrandKitLogoSlotSpec | IBrandKitPlatformSlotSpec;
  asset: IAsset | undefined;
  imageUrl: string | undefined;
  isManager: boolean;
  isDefault?: boolean;
  isFilling?: boolean;
  onUpload: () => void;
  onFillFromMaster?: () => void;
  /** Logo variants only: download the logo in a chosen format and size. */
  onDownload?: (format: BrandLogoDownloadFormat, size: number) => void;
  isDownloading?: boolean;
}

export interface BrandLogoDownloadMenuProps {
  /** The logo variant's name, for the menu button's accessible label. */
  label: string;
  /** Whether the logo was uploaded as an SVG, so the vector can download. */
  hasVector: boolean;
  isDisabled?: boolean;
  onDownload: (format: BrandLogoDownloadFormat, size: number) => void;
}
