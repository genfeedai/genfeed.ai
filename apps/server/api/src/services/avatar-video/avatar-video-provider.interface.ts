/**
 * AvatarVideoProvider — multi-provider abstraction for avatar video generation.
 *
 * Implementations:
 *   - HeyGen   (default, production-ready)
 *   - D-ID     (stub — coming soon)
 *   - Tavus    (stub — coming soon)
 *   - MuseTalk (stub — self-hosted via Darkroom/ComfyUI, coming soon)
 */

export type AvatarVideoProviderName = 'heygen' | 'did' | 'tavus' | 'musetalk';

export interface AvatarVideoJobInput {
  avatarId: string;
  callbackId: string;
  script: string;
  organizationId: string;
  userId: string;
  voiceId: string;
  language?: string;
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
