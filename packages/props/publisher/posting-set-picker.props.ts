import type {
  IPostingSet,
  IPostingSetTargetValidation,
  IPostingSignature,
} from '@genfeedai/contracts/interfaces';

export interface PostingSetPickerProps {
  canSave: boolean;
  expandError?: string;
  isExpanding?: boolean;
  isSaving?: boolean;
  onSaveCurrent: (label: string) => void;
  onSelectSet: (id: string) => void;
  saveError?: string;
  selectedSetId?: string;
  sets: IPostingSet[];
}

export interface PostingSignaturePickerProps {
  onChange: (signatureIds: string[]) => void;
  platform: string;
  selectedIds: string[];
  signatures: IPostingSignature[];
}

export interface PostingSetTargetHealthProps {
  validation?: IPostingSetTargetValidation;
}
