import { describe, expect, it } from 'vitest';
import {
  CLIP_ANALYZE_CONCURRENCY,
  CLIP_ANALYZE_JOB_NAME,
} from './clip-analyze-job.interface';
import {
  AVATAR_VIDEO_PROVIDER_NAMES,
  CLIP_FACTORY_CONCURRENCY,
  CLIP_FACTORY_JOB_NAME,
  isSupportedAvatarVideoProviderName,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
} from './clip-factory-job.interface';
import {
  HEYGEN_POLL_DELAY_MS,
  HEYGEN_POLL_MAX_ATTEMPTS,
} from './heygen-poll-job.interface';
import { INSIGHT_GENERATION_JOB_NAME } from './insight-generation-job.interface';
import { POST_PUBLISH_JOB_NAME } from './post-publish-job.interface';

describe('job-data constants', () => {
  it('preserves the clip-analyze contract values', () => {
    // Job names are wire-level contracts persisted in Redis job keys.
    expect(CLIP_ANALYZE_JOB_NAME).toBe('clip-analyze-run');
    expect(CLIP_ANALYZE_CONCURRENCY).toBe(3);
  });

  it('preserves the clip-factory contract values', () => {
    expect(CLIP_FACTORY_JOB_NAME).toBe('clip-factory-run');
    expect(CLIP_FACTORY_CONCURRENCY).toBe(2);
  });

  it('preserves the heygen-poll cadence contract', () => {
    expect(HEYGEN_POLL_DELAY_MS).toBe(15_000);
    expect(HEYGEN_POLL_MAX_ATTEMPTS).toBe(40);
  });

  it('preserves the post-publish job name', () => {
    expect(POST_PUBLISH_JOB_NAME).toBe('publish-post');
  });

  it('preserves the insight-generation job name', () => {
    expect(INSIGHT_GENERATION_JOB_NAME).toBe('generate-insights');
  });

  describe('avatar video providers', () => {
    it('keeps supported providers a subset of all known providers', () => {
      for (const provider of SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES) {
        expect(AVATAR_VIDEO_PROVIDER_NAMES).toContain(provider);
      }
    });

    it('accepts every supported provider name', () => {
      for (const provider of SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES) {
        expect(isSupportedAvatarVideoProviderName(provider)).toBe(true);
      }
    });

    it('rejects known-but-unsupported and unknown provider names', () => {
      expect(isSupportedAvatarVideoProviderName('did')).toBe(false);
      expect(isSupportedAvatarVideoProviderName('tavus')).toBe(false);
      expect(isSupportedAvatarVideoProviderName('musetalk')).toBe(false);
      expect(isSupportedAvatarVideoProviderName('not-a-provider')).toBe(false);
      expect(isSupportedAvatarVideoProviderName('')).toBe(false);
    });
  });
});
