import type {
  BrandKitAssetRole,
  BrandKitFieldKey,
  IBrandKitDraft,
  IBrandKitDraftField,
  IBrandKitFieldOwner,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

export interface BrandOsIdentityPreviewProps {
  organizationId: string;
  brandId: string;
  refreshKey: string | number;
  isDisabled: boolean;
}

export interface BrandOsSettingsCardProps {
  brandId: string;
  refreshKey?: number;
  onRevisionSaved?: (revision: IBrandOsRevision) => void;
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

export interface BrandOsGenerationRulesReviewProps {
  rules: BrandGenerationRulesV1;
  acknowledged: boolean;
  isDisabled: boolean;
  showAcknowledgement: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
}
