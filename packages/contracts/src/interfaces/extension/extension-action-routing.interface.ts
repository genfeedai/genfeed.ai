import type { NativeHostProviderIdValue } from '../../constants/native-host.constant';

/** Why a text action ran on a local provider instead of Genfeed cloud. */
export type CloudFallbackReason =
  | 'service_unavailable'
  | 'quota_exceeded'
  | 'credit_limit';

/** Where a voice-aware local action got the approved brand voice. */
export type LocalVoiceSource = 'live' | 'cached' | 'none';

/** Attached to a result a local provider wrote; the extension always shows it. */
export interface ActionRouting {
  hasBrandVoice: boolean;
  providerId: NativeHostProviderIdValue;
  providerLabel: string;
  reason: CloudFallbackReason;
  /** The sentence shown to the user. */
  notice: string;
  voiceSource: LocalVoiceSource;
}

export type ActionFailureKind =
  /** Sign-in, access or workspace problem: fix it and run the action again. Never falls back. */
  | 'recovery_required'
  /** Genfeed did not confirm whether the request finished. Nothing went to a local provider. */
  | 'cloud_unconfirmed'
  /** The cloud failed for good but the native host could not be reached. */
  | 'host_unreachable'
  /** The host answered with a failure, or the voice needed for the local run was unavailable. */
  | 'host_failed'
  /** A definitive cloud failure that is not eligible for fallback (invalid input, rejected output). */
  | 'cloud_rejected';

/** What the user can do next after a failed text action. */
export interface ActionRecovery {
  canOpenProviderSettings: boolean;
  canRetry: boolean;
  kind: ActionFailureKind;
  /** Retry reruns the same request key: against the local provider only, or against Genfeed to reconcile. */
  retryTarget: 'cloud' | 'local' | null;
}
