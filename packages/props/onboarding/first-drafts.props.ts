import type {
  IOnboardingDraftContext,
  IOnboardingFirstDraft,
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
} from '@genfeedai/contracts/interfaces';

export type FirstDraftsPhase =
  | 'url'
  | 'working'
  | 'review'
  | 'context'
  | 'schedule';

/** The member's own answer to "would you post this?" for one draft. */
export type FirstDraftVerdict = 'up' | 'down';
export type FirstDraftsWorkingStep = 'scanning' | 'drafting';
export type FirstDraftsError = 'generate' | 'continue';

export interface FirstDraftsState {
  canRetry: boolean;
  error: FirstDraftsError | null;
  isContinuing: boolean;
  isReady: boolean;
  isScanFailed: boolean;
  likedDrafts: IOnboardingFirstDraft[];
  phase: FirstDraftsPhase;
  result: IOnboardingFirstDraftsResult | null;
  round: number;
  scan: IOnboardingScanResult | null;
  url: string;
  verdicts: Readonly<Record<string, FirstDraftVerdict>>;
  workingStep: FirstDraftsWorkingStep;
  onContinue: () => void;
  onNotRight: () => void;
  onSchedule: () => void;
  onVerdict: (draft: IOnboardingFirstDraft, verdict: FirstDraftVerdict) => void;
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
  onVerdict: (draft: IOnboardingFirstDraft, verdict: FirstDraftVerdict) => void;
  verdict?: FirstDraftVerdict;
}

export type ScheduleRowState =
  | 'connect'
  | 'ready'
  | 'scheduled'
  | 'failed'
  | 'unsupported';

export interface ScheduleRow {
  credentialId: string | null;
  draft: IOnboardingFirstDraft;
  scheduledAt: string;
  state: ScheduleRowState;
}

export interface FirstDraftsScheduleProps {
  brandId: string;
  imageIngredientId: string | null;
  isFinishing: boolean;
  likedDrafts: IOnboardingFirstDraft[];
  onFinish: () => void;
}
