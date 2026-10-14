import type { HeyGenAvatarEngine } from '@genfeedai/contracts/constants';
import type {
  HeyGenAvatarRef,
  IBrandAgentConfig,
} from '@genfeedai/contracts/interfaces';
/**
 * AvatarVideoProvider — multi-provider abstraction for avatar video generation.
 *
 * Implementations:
 *   - HeyGen   (default, production-ready)
 *   - D-ID     (stub — coming soon)
 *   - Tavus    (stub — coming soon)
 *   - MuseTalk (stub — self-hosted via Fleet/ComfyUI, coming soon)
 */

import type { AvatarVideoProviderName } from '@genfeedai/contracts/interfaces';

export interface AvatarVideoJobCreated {
  jobId: string;
  providerName: AvatarVideoProviderName;
}

/** What a render is priced as, resolved by the provider just before submission. */
export interface AvatarVideoSubmissionPlan {
  /** A customer connection pays the provider directly; no platform hold. */
  isByok: boolean;
  selection: {
    modelKey: string;
    engine?: HeyGenAvatarEngine;
    avatarType?: string;
  };
}

/** A hold bound to the render; released only on a definitive rejection. */
export interface AvatarVideoSubmissionHold {
  release(): Promise<void>;
}

export interface AvatarVideoJobInput {
  avatarRef?: HeyGenAvatarRef;
  voiceRef?: NonNullable<IBrandAgentConfig['defaultVoiceRef']>;
  avatarId: string;
  callbackId: string;
  script: string;
  organizationId: string;
  userId: string;
  voiceId: string;
  language?: string;
  onJobCreated?: (job: AvatarVideoJobCreated) => Promise<void>;
  /** Funds the render after the provider resolves who pays and what it renders. */
  fundSubmission?: (
    plan: AvatarVideoSubmissionPlan,
  ) => Promise<AvatarVideoSubmissionHold | undefined>;
  referenceImageUrl?: string;
}

export interface AvatarVideoJobResult {
  jobId: string;
  providerName: AvatarVideoProviderName;
  /** `unknown`: the provider could not be read; never treat it as failure. */
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'unknown';
  videoUrl?: string;
  /** Clip seconds the provider reports on completion. */
  duration?: number;
  error?: string;
}

export interface AvatarVideoProvider {
  readonly providerName: AvatarVideoProviderName;
  generateVideo(input: AvatarVideoJobInput): Promise<AvatarVideoJobResult>;
  getStatus(
    jobId: string,
    organizationId: string,
  ): Promise<AvatarVideoJobResult>;
}
