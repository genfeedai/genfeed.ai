import type {
  IPostingSet,
  IPostingSignature,
  PostingSetReferenceState,
} from '@genfeedai/contracts/interfaces';

export interface PostingSetPickerTarget {
  credentialId: string;
  issues?: string[];
  platform: string;
  scheduledDate?: string;
  signatureIds?: string[];
  targetKey?: string;
  timezone?: string;
  validationState?: PostingSetReferenceState;
}

export interface PostingSetPickerProps {
  brandId: string;
  currentTargets: PostingSetPickerTarget[];
  isDisabled?: boolean;
  onApply: (targets: PostingSetPickerTarget[], postingSetId: string) => void;
  timezone: string;
}

export interface PostingSetPickerListItem {
  postingSet: IPostingSet;
}

export interface PublishingPostingSetsSectionProps {
  brandId: string;
  timezone: string;
}

export interface PublishingPostingSetCreateInput {
  description?: string;
  label: string;
  targets: PostingSetPickerTarget[];
}

export interface PostingSetSignatureOption {
  id: string;
  label: string;
  signature: IPostingSignature;
}
