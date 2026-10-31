import type { PostingSetReferenceState } from '@genfeedai/contracts/interfaces';

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

export interface SchedulerPostingSetPickerProps {
  brandId: string;
  currentTargets: PostingSetPickerTarget[];
  isDisabled?: boolean;
  onApply: (targets: PostingSetPickerTarget[], postingSetId: string) => void;
  timezone: string;
}

export interface PublishingPostingSetsSectionProps {
  brandId: string;
  timezone: string;
}
