import type {
  HeyGenConnectionState,
  IAvatarTwin,
} from '@genfeedai/contracts/interfaces';

export type AvatarTwinSubmitPhase = 'uploading' | 'starting';

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
  submit: (recording: File, name: string) => Promise<void>;
  submitPhase: AvatarTwinSubmitPhase | null;
  /** The person's latest twin, or null before the first take. */
  twin: IAvatarTwin | null;
  /** 0–100 while the take uploads. */
  uploadProgress: number;
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
  onSubmit: (recording: File) => Promise<void>;
  onCancel?: () => void;
}

export interface AvatarTwinProgressProps {
  twin: IAvatarTwin;
  libraryHref: string;
  /** Resolves to the consent page URL. */
  onOpenConsent: () => Promise<string>;
  onRemove: () => Promise<void>;
  onRetake: () => void;
}
