import type {
  BrandKitAssetImportStatus,
  BrandKitAssetRole,
  BrandKitFieldGroup,
  BrandKitFieldKey,
  IBrandKitAssetCandidate,
  IBrandKitAssetImportResponse,
  IBrandKitAssetValue,
  IBrandKitDraft,
  IBrandKitDraftField,
  IBrandKitSourceEvidence,
} from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export type EvidenceKind = 'candidate' | 'extracted' | 'inferred' | 'missing';

export type BrandKitFieldValues = Partial<Record<BrandKitFieldKey, string>>;

export type BrandKitGroupedField = {
  field: IBrandKitDraftField;
  key: BrandKitFieldKey;
};

export interface BrandKitSocialProposal {
  platform: string;
  url: string;
}

export interface ReviewProposedValueProps {
  assetCandidates: readonly IBrandKitAssetCandidate[];
  assetImportFooter: ReactNode;
  editableValue: string;
  isAssetField: boolean;
  isColorField: boolean;
  isEditable: boolean;
  isSocialField: boolean;
  label: string;
  noProposalLabel: string;
  onToggleCandidate: (candidateId: string) => void;
  onValueChange: (value: string) => void;
  proposedAssets: readonly IBrandKitAssetValue[];
  proposedValue: string;
  selectedCandidateIds: ReadonlySet<string>;
  socialValue: unknown;
  statusLabelByCandidateId: ReadonlyMap<string, string>;
}

export interface EvidenceLabelProps {
  kind: EvidenceKind;
}
export interface SourceEvidenceRowsProps {
  evidence: readonly IBrandKitSourceEvidence[];
}
export interface SocialLinkReadoutProps {
  emptyLabel: string;
  value: unknown;
}
export interface BrandKitReviewFieldsProps {
  draft: IBrandKitDraft;
  groupedFields: ReadonlyMap<
    BrandKitFieldGroup,
    readonly BrandKitGroupedField[]
  >;
  fieldValues: BrandKitFieldValues;
  selectedFields: ReadonlySet<BrandKitFieldKey>;
  selectedCandidateIds: ReadonlySet<string>;
  statusLabelByCandidateId: ReadonlyMap<string, string>;
  isApplying: boolean;
  isImportingAssets: boolean;
  handleToggleField: (key: BrandKitFieldKey, checked: boolean) => void;
  handleApplyKeys: (keys: readonly BrandKitFieldKey[]) => Promise<void>;
  handleImportAssets: () => Promise<void>;
  handleToggleCandidate: (candidateId: string) => void;
  handleFieldValueChange: (key: BrandKitFieldKey, value: string) => void;
}
export interface BrandKitReviewAssetsProps {
  draft: IBrandKitDraft;
  candidatesByRole: ReadonlyMap<
    BrandKitAssetRole,
    readonly IBrandKitAssetCandidate[]
  >;
  importStatusByCandidateId: ReadonlyMap<string, BrandKitAssetImportStatus>;
  selectedCandidateIds: ReadonlySet<string>;
  shouldReplaceExisting: boolean;
  setShouldReplaceExisting: (isReplacing: boolean) => void;
  isImportingAssets: boolean;
  handleToggleCandidate: (candidateId: string) => void;
  handleImportAssets: () => Promise<void>;
  assetImportResult: IBrandKitAssetImportResponse | null;
}
