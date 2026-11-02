import type {
  IOnboardingCampaignImage,
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
export type FirstDraftsError =
  | 'generate'
  | 'continue'
  | 'recovery'
  | 'feedback'
  | 'invalidUrl'
  | 'mediaRetry'
  | 'replay';

export interface FirstDraftsState {
  canRetry: boolean;
  /** A missing campaign image can be generated again for this run. */
  canRetryMedia: boolean;
  error: FirstDraftsError | null;
  isContinuing: boolean;
  isReady: boolean;
  isRestoring: boolean;
  isGenerating: boolean;
  savingPostIds: readonly string[];
  isScanFailed: boolean;
  likedDrafts: IOnboardingFirstDraft[];
  phase: FirstDraftsPhase;
  result: IOnboardingFirstDraftsResult | null;
  round: number;
  scan: IOnboardingScanResult | null;
  url: string;
  verdicts: Readonly<Record<string, FirstDraftVerdict>>;
  workingStep: FirstDraftsWorkingStep;
  onRetryMedia: () => void;
  onNavigate: (step: number) => void;
  onBack: () => void;
  onContinue: () => void;
  onNotRight: () => void;
  onSchedule: () => void;
  onVerdict: (
    draft: IOnboardingFirstDraft,
    verdict: FirstDraftVerdict | null,
  ) => void;
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
  /** This platform's own images, in slide order. Empty for runs saved before campaign images. */
  images: readonly IOnboardingCampaignImage[];
  /** The master campaign image, shown when the platform has no image of its own. */
  masterUrl: string | null;
  brandName?: string;
  avatarUrl?: string;
  isSaving?: boolean;
  /** Set while the missing images are being generated. */
  isMediaGenerating?: boolean;
  /** Offered only when the draft's images are missing and a retry is left. */
  onRetryMedia?: () => void;
  onVerdict: (
    draft: IOnboardingFirstDraft,
    verdict: FirstDraftVerdict | null,
  ) => void;
  verdict?: FirstDraftVerdict;
}

export interface FirstDraftsScheduleProps {
  brandId: string;
}

export interface ConnectPlatformsProps {
  brandId: string;
  /** App path the provider returns to once the account is connected. */
  returnTo: string;
}
