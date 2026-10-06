import type {
  BrandKitAssetRole,
  BrandKitFieldGroup,
  BrandKitFieldKey,
  IBrandKitDraft,
  IBrandKitDraftField,
  IBrandKitFieldOwner,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { ReactNode } from 'react';

export interface BrandOsIdentityPreviewProps {
  organizationId: string;
  brandId: string;
  refreshKey: string | number;
  isDisabled: boolean;
}

export interface BrandOsGuideReadiness {
  isLoaded: boolean;
  canManage: boolean;
  isApproved: boolean;
  isDirty: boolean;
  isBusy: boolean;
}

export interface BrandOsSettingsCardProps {
  brandId: string;
  refreshKey?: number;
  fieldGroups?: readonly BrandKitFieldGroup[];
  renderWorkspace?: (workspace: BrandKitRevisionWorkspace) => ReactNode;
  isAutoSaveEnabled?: boolean;
  onRevisionSaved?: (revision: IBrandOsRevision) => void;
  onReadinessChange?: (readiness: BrandOsGuideReadiness) => void;
  onRefreshBrand: () => Promise<void>;
}

export interface BrandOsRevisionFieldsProps {
  content: IBrandKitDraft;
  groups?: readonly BrandKitFieldGroup[];
  showDecisions?: boolean;
  isDisabled: boolean;
  onFieldChange: (
    key: BrandKitFieldKey,
    update: Partial<IBrandKitDraftField>,
  ) => void;
}

export interface BrandOsValueEditorProps {
  valueKind: IBrandKitFieldOwner['valueKind'];
  fieldKey?: BrandKitFieldKey;
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

export interface BrandKitRevisionWorkspace {
  content: IBrandKitDraft | null;
  approvedContent: IBrandKitDraft | null;
  editor: ReactNode;
  review: ReactNode;
  isDirty: boolean;
  isLoading: boolean;
  isSaveDisabled: boolean;
  error: string | null;
  onSave: () => void;
}
