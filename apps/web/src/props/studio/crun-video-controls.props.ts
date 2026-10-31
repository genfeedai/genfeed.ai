import type {
  CrunInputControls,
  CrunInputFieldError,
  CrunVideoDraft,
} from '@genfeedai/contracts/interfaces';

export interface CrunVideoControlsLabels {
  duration: string;
  aspectRatio: string;
  resolution: string;
  negativePrompt: string;
  guidanceScale: string;
  translatePrompt: string;
  pricingReviewRequired: string;
  aspectFromFrames: string;
  invalidContract: string;
  errorMessages: Record<CrunInputFieldError['code'], string>;
}

export interface CrunVideoControlsProps {
  controls: CrunInputControls;
  value: CrunVideoDraft;
  onChange: (patch: Partial<CrunVideoDraft>) => void;
  isDisabled?: boolean;
  errors?: readonly CrunInputFieldError[];
  labels: CrunVideoControlsLabels;
}
