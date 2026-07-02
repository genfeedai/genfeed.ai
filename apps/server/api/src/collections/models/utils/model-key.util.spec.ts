import {
  isGenfeedAiDestination,
  isReplicateDestination,
  isTrainingKey,
} from '@api/collections/models/utils/model-key.util';

describe('model-key.util', () => {
  it('detects genfeed-ai self-hosted destinations', () => {
    expect(isGenfeedAiDestination('genfeed-ai/z-image-turbo')).toBe(true);
  });

  it('does not treat genfeed-ai self-hosted destinations as Replicate', () => {
    expect(isReplicateDestination('genfeed-ai/z-image-turbo')).toBe(false);
  });

  it('still treats owner/model destinations as Replicate when not self-hosted', () => {
    expect(isReplicateDestination('google/imagen-4')).toBe(true);
  });

  it('treats dot-versioned Replicate model keys as Replicate', () => {
    expect(isReplicateDestination('bytedance/seedream-4.5')).toBe(true);
  });

  it('treats dot-versioned owner/model:version Replicate keys as Replicate', () => {
    expect(isReplicateDestination('bytedance/seedance-2.0')).toBe(true);
    expect(isReplicateDestination('owner/model:1.2.3')).toBe(true);
  });

  it('still excludes fal-ai destinations even when dot-versioned', () => {
    expect(isReplicateDestination('fal-ai/veo3.1')).toBe(false);
    expect(isReplicateDestination('fal-ai/seedance-2.0')).toBe(false);
  });

  describe('isTrainingKey', () => {
    it('returns true for new genfeed-ai/owner/model format', () => {
      expect(isTrainingKey('genfeed-ai/663a1b/6721cf')).toBe(true);
    });

    it('returns true for legacy genfeedai/owner/model format', () => {
      expect(isTrainingKey('genfeedai/663a1b/6721cf')).toBe(true);
    });

    it('returns false for base genfeed-ai model with 2 segments', () => {
      expect(isTrainingKey('genfeed-ai/flux-dev')).toBe(false);
    });

    it('returns false for non-genfeed model keys', () => {
      expect(isTrainingKey('google/imagen-4')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isTrainingKey(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isTrainingKey(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isTrainingKey('')).toBe(false);
    });
  });
});
