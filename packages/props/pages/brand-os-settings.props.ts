import type {
  BrandKitAssetRole,
  BrandKitFieldKey,
  IBrandKitDraft,
  IBrandKitDraftField,
  IBrandKitFieldOwner,
} from '@genfeedai/contracts/interfaces';

export interface BrandOsSettingsCardProps {
  brandId: string;
  refreshKey?: number;
  onRefreshBrand: () => Promise<void>;
}

export interface BrandOsRevisionFieldsProps {
  content: IBrandKitDraft;
  isDisabled: boolean;
  onFieldChange: (
    key: BrandKitFieldKey,
    update: Partial<IBrandKitDraftField>,
  ) => void;
}

export interface BrandOsValueEditorProps {
  valueKind: IBrandKitFieldOwner['valueKind'];
  assetRole?: BrandKitAssetRole;
  label: string;
  value: unknown;
  isDisabled: boolean;
  onChange: (value: unknown) => void;
}
