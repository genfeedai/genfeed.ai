import type { CredentialPlatform } from '@genfeedai/contracts';
import type {
  AccountHealthSummary,
  ISocialWarmupEnrollment,
  ISocialWarmupSignal,
  SocialWarmupEventProvenance,
} from '@genfeedai/contracts/interfaces';
import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';

export type SocialWarmupProgramView = 'today' | 'full';

export type SocialWarmupCheckUiState =
  | 'complete'
  | 'open'
  | 'stale'
  | 'permission_limited'
  | 'reconnect'
  | 'loading'
  | 'empty'
  | 'failed'
  | 'missing';

export type SocialWarmupCheckKind = 'step' | 'graduation';

export type SocialWarmupRequirement =
  | 'required'
  | 'required_when_available'
  | 'optional';

export type SocialWarmupCompletionType = 'attestation' | 'signal' | 'event';

export interface SocialWarmupCheckView {
  completionKey: string;
  completionType: SocialWarmupCompletionType;
  days: number[];
  description: string;
  id: string;
  kind: SocialWarmupCheckKind;
  phaseId: string;
  phaseTitle: string;
  provenance: SocialWarmupEventProvenance;
  requirement: SocialWarmupRequirement;
  title: string;
}

export interface SocialWarmupResolvedCheck extends SocialWarmupCheckView {
  isComplete: boolean;
  provenanceLabel: string;
  signal?: ISocialWarmupSignal;
  state: SocialWarmupCheckUiState;
}

export interface SocialWarmupProgress {
  completed: number;
  percent: number;
  total: number;
}

export interface SocialWarmupProgramModel {
  currentDay: number;
  currentPhaseId: string;
  currentPhaseTitle: string;
  lastRefreshAt: string | null;
  nextAction: SocialWarmupResolvedCheck | null;
  progress: SocialWarmupProgress;
  todayChecks: SocialWarmupResolvedCheck[];
  unresolvedChecks: SocialWarmupResolvedCheck[];
}

export interface SocialWarmupBlueprintLike {
  graduation: {
    recommendedElapsedDays: number;
    rules: readonly SocialWarmupCheckViewLike[];
  };
  phases: readonly SocialWarmupPhaseLike[];
}

export interface SocialWarmupPhaseLike {
  endDay: number;
  id: string;
  startDay: number;
  steps: readonly SocialWarmupStepLike[];
  title: string;
}

export interface SocialWarmupCheckViewLike {
  completion: {
    key: string;
    type: SocialWarmupCompletionType;
  };
  description: string;
  id: string;
  provenance: SocialWarmupEventProvenance;
  requirement: SocialWarmupRequirement;
  title: string;
}

export interface SocialWarmupStepLike extends SocialWarmupCheckViewLike {
  days: readonly number[];
}

export interface BuildSocialWarmupProgramModelInput {
  blueprint: SocialWarmupBlueprintLike;
  enrollment: ISocialWarmupEnrollment;
  isRefreshingSignals?: boolean;
  now?: Date;
  platform: CredentialPlatform | string;
}

export interface ResolveSocialWarmupCheckStateInput {
  check: SocialWarmupCheckView;
  enrollment: ISocialWarmupEnrollment;
  isRefreshingSignals?: boolean;
}

export interface SocialWarmupCheckItemProps {
  check: SocialWarmupResolvedCheck;
  focusedCheckId?: string | null;
  isPending?: boolean;
  onComplete: (itemId: string) => void;
  onFocusCheck?: (itemId: string) => void;
  onReconnect?: () => void;
  onRefreshSignals?: () => void;
  onReopen: (itemId: string) => void;
}

export interface SocialWarmupOverrideRequest {
  credentialId: string;
  unresolvedChecks: readonly Pick<SocialWarmupResolvedCheck, 'id' | 'title'>[];
}

export interface SocialWarmupProgramProps {
  connection: BrandDetailSocialConnection;
  health?: AccountHealthSummary;
  onHealthUpdated?: (summary: AccountHealthSummary) => void;
  onOverrideRequest?: (request: SocialWarmupOverrideRequest) => void;
  onReconnect?: (platform: CredentialPlatform | string) => void;
}
