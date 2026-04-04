import type { AvatarVideoProviderName } from '@api/services/avatar-video/avatar-video-provider.interface';

/**
 * Clip Factory queue constants.
 *
 * Isolated queue so the clip-factory workload can be moved to a dedicated
 * worker instance without code changes.
 */
export const CLIP_FACTORY_QUEUE = 'clip-factory';

export const CLIP_FACTORY_JOB_NAME = 'clip-factory-run';

/** Default concurrency — one long-running pipeline per worker. */
export const CLIP_FACTORY_CONCURRENCY = 2;

export interface ClipFactoryJobData {
  projectId: string;
  youtubeUrl: string;
  avatarId: string;
  voiceId: string;
  avatarProvider: AvatarVideoProviderName;
  maxClips: number;
  minViralityScore: number;
  language: string;
  orgId: string;
  userId: string;
}
