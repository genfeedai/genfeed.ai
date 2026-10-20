import type {
  IOnboardingDraftContext,
  IOnboardingFirstDraft,
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
} from '@genfeedai/contracts/interfaces';

export type FirstDraftsPhase = 'url' | 'working' | 'review' | 'context';
export type FirstDraftsWorkingStep = 'scanning' | 'drafting';
export type FirstDraftsError = 'generate' | 'continue';

export interface FirstDraftsState {
  canRetry: boolean;
  error: FirstDraftsError | null;
  isContinuing: boolean;
  isReady: boolean;
  isScanFailed: boolean;
  phase: FirstDraftsPhase;
  result: IOnboardingFirstDraftsResult | null;
  round: number;
  scan: IOnboardingScanResult | null;
  url: string;
  workingStep: FirstDraftsWorkingStep;
  onContinue: () => void;
  onNotRight: () => void;
  onSkipLink: () => void;
  onStart: (link?: string) => void;
  onSubmitContext: (context: IOnboardingDraftContext) => void;
  onUrlChange: (value: string) => void;
}

export interface FirstDraftsContextFormProps {
  audienceSuggestions: readonly string[];
  hasError: boolean;
  isScanFailed: boolean;
  isWebsiteMissing: boolean;
  offerSuggestions: readonly string[];
  onSubmit: (context: IOnboardingDraftContext) => void;
}

export interface FirstDraftCardProps {
  draft: IOnboardingFirstDraft;
  imageUrl: string | null;
}
