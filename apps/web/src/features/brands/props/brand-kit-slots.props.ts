import type { BrandKitSlot } from '@genfeedai/contracts';
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
}
