import type {
  HeyGenConnectionState,
  IAvatarTwin,
} from '@genfeedai/contracts/interfaces';

export type AvatarTwinSubmitPhase = 'uploading' | 'starting';

/** Which voice the brand speaks with once it uses the twin. */
export type AvatarTwinVoiceChoice = 'twin' | 'keep';

export interface AvatarTwinSubmitInput {
  isRecordingKept: boolean;
  name: string;
  recording: File;
}

/** The selected brand's identity defaults, read against the twin. */
export interface AvatarTwinBrandUsage {
  /** The brand already has a default voice to keep. */
  hasVoice: boolean;
  /** The brand's default avatar is this twin's look. */
  isUsingTwin: boolean;
}

export interface AvatarTwinEnrollment {
  /** Null until the workspace's own HeyGen connection has been checked. */
  connectionState: HeyGenConnectionState | null;
  isLoading: boolean;
  /** The person asked for a new take while an earlier twin exists. */
  isRetaking: boolean;
  loadError: Error | null;
  /** Issues a consent link that returns to `returnPath`; resolves to its URL. */
  openConsent: (twinId: string, returnPath: string) => Promise<string>;
  recheckConnection: () => Promise<void>;
  refreshTwin: () => Promise<void>;
  remove: (twinId: string) => Promise<void>;
  setIsRetaking: (isRetaking: boolean) => void;
  submit: (input: AvatarTwinSubmitInput) => Promise<void>;
  submitPhase: AvatarTwinSubmitPhase | null;
  /** The person's latest twin, or null before the first take. */
  twin: IAvatarTwin | null;
  /** 0–100 while the take uploads. */
  uploadProgress: number;
  /** Null outside a brand. */
  brandUsage: AvatarTwinBrandUsage | null;
  /** Makes the ready twin the brand's default avatar (and voice). */
  applyToBrand: (
    twin: IAvatarTwin,
    voice: AvatarTwinVoiceChoice,
  ) => Promise<void>;
}

export interface AvatarTwinConnectStepProps {
  connectHref: string;
  isInvalid: boolean;
  onRecheck: () => void;
}

export interface AvatarTwinRecorderProps {
  /** Uploading or starting: the controls lock until it settles. */
  submitPhase: AvatarTwinSubmitPhase | null;
  uploadProgress: number;
  onSubmit: (recording: File, isRecordingKept: boolean) => Promise<void>;
  onCancel?: () => void;
}

export interface AvatarTwinProgressProps {
  twin: IAvatarTwin;
  libraryHref: string;
  /** Where the person makes a video with the twin. */
  studioHref: string;
  brandUsage: AvatarTwinBrandUsage | null;
  onApplyToBrand: (voice: AvatarTwinVoiceChoice) => Promise<void>;
  /** Resolves to the consent page URL. */
  onOpenConsent: () => Promise<string>;
  onRemove: () => Promise<void>;
  onRetake: () => void;
}
