import type {
  IPostingSet,
  IPostingSetTargetValidation,
  IPostingSignature,
} from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface PostingSetPickerProps {
  canSave: boolean;
  children?: ReactNode;
  isDisabled?: boolean;
  isLoading?: boolean;
  variant?: 'select' | 'cards';
  /** Controlled labels remain intact until the parent confirms a successful save. */
  saveLabel?: string;
  onSaveLabelChange?: (label: string) => void;
  saveOptions?: ReactNode;
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
