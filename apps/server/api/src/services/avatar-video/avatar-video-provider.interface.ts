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

export interface AvatarVideoJobInput {
  avatarId: string;
  callbackId: string;
  script: string;
  organizationId: string;
  userId: string;
  voiceId: string;
  language?: string;
  onJobCreated?: (job: AvatarVideoJobCreated) => Promise<void>;
  referenceImageUrl?: string;
}

export interface AvatarVideoJobResult {
  jobId: string;
  providerName: AvatarVideoProviderName;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
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
