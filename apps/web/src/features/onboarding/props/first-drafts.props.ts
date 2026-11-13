import type {
  ConnectGenfeedClient,
  IOnboardingCampaignImage,
  IOnboardingDraftContext,
  IOnboardingFirstDraft,
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
  OnboardingDraftPlatform,
} from '@genfeedai/contracts/interfaces';

/**
 * The four onboarding steps map onto these phases: `url`, `working`, `context`
 * and `review` are "See your output"; then `agent`, `channels` and `prompt`.
 */
export type FirstDraftsPhase =
  | 'url'
  | 'working'
  | 'review'
  | 'context'
  | 'agent'
  | 'channels'
  | 'prompt';

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
  | 'rewrite'
  | 'replay';

/** What the scan or the member's own answers say the brand sells, and to whom. */
export interface FirstDraftsUnderstood {
  audience?: string;
  offer?: string;
}

export interface FirstDraftsState {
  canRetry: boolean;
  /** A missing campaign image can be generated again for this run. */
  canRetryMedia: boolean;
  /** A post can be written again: not while the run is working, and never in a replay. */
  canRewrite: boolean;
  /** Rewrites left per channel for this run. */
  draftRewritesRemaining: Readonly<Record<OnboardingDraftPlatform, number>>;
  error: FirstDraftsError | null;
  isContinuing: boolean;
  isReady: boolean;
  isRestoring: boolean;
  isGenerating: boolean;
  /** The channel whose post is being written again, if any. */
  rewritingPlatform: OnboardingDraftPlatform | null;
  savingPostIds: readonly string[];
  isScanFailed: boolean;
  likedDrafts: IOnboardingFirstDraft[];
  /** Drafting rounds allowed for this run, the first included. */
  maxRounds: number;
  phase: FirstDraftsPhase;
  result: IOnboardingFirstDraftsResult | null;
  round: number;
  scan: IOnboardingScanResult | null;
  understood: FirstDraftsUnderstood | null;
  url: string;
  verdicts: Readonly<Record<string, FirstDraftVerdict>>;
  workingStep: FirstDraftsWorkingStep;
  onRetryMedia: () => void;
  onRewrite: (platform: OnboardingDraftPlatform) => void;
  onNavigate: (step: number) => void;
  onBack: () => void;
  onContinue: () => void;
  onCancelRedo: () => void;
  onNotRight: () => void;
  /** Moves to the next step, or leaves onboarding from the last one. */
  onAdvance: () => void;
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
  /** What the form starts with when it asks for a redo of drafts that already exist. */
  initial?: FirstDraftsUnderstood;
  isScanFailed: boolean;
  isWebsiteMissing: boolean;
  offerSuggestions: readonly string[];
  /** Set when the member can go back to the drafts they already have. */
  onCancel?: () => void;
  onSubmit: (context: IOnboardingDraftContext) => void;
}

export interface FirstDraftsUnderstoodLineProps {
  canRedo: boolean;
  isBusy: boolean;
  maxRounds: number;
  onNotRight: () => void;
  round: number;
  understood: FirstDraftsUnderstood | null;
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
  /** Rewrites left for this post's channel; "Write another" shows once the post is rejected. */
  rewritesRemaining?: number;
  /** Set while this post is being written again. */
  isRewriting?: boolean;
  /** Set while any post is being written, so only one rewrite runs at a time. */
  isRewriteBusy?: boolean;
  onRewrite?: (platform: OnboardingDraftPlatform) => void;
  onVerdict: (
    draft: IOnboardingFirstDraft,
    verdict: FirstDraftVerdict | null,
  ) => void;
  verdict?: FirstDraftVerdict;
}

export interface FirstDraftMissingCardProps {
  isBusy: boolean;
  isRewriting: boolean;
  onRewrite: (platform: OnboardingDraftPlatform) => void;
  platform: OnboardingDraftPlatform;
  rewritesRemaining: number;
}

export interface FirstDraftsChannelsProps {
  brandId: string;
}

export interface FirstDraftsAgentProps {
  client: ConnectGenfeedClient;
  onClientChange: (client: ConnectGenfeedClient) => void;
}

export interface FirstDraftsPromptProps {
  brandName: string;
  client: ConnectGenfeedClient;
}

export interface ConnectPlatformsProps {
  brandId: string;
  /** App path the provider returns to once the account is connected. */
  returnTo: string;
}
