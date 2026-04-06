import { MODEL_KEYS } from '@genfeedai/constants';
import {
  getDefaultVideoResolution,
  getVideoResolutionsByModel,
  hasResolutionOptions,
  videoModelResolutions,
} from '@helpers/media/video-resolution/video-resolution.helper';
import { describe, expect, it } from 'vitest';

describe('videoModelResolutions', () => {
  it('is a non-empty array', () => {
    expect(videoModelResolutions.length).toBeGreaterThan(0);
  });

  it('every entry has model, resolutions, and default fields', () => {
    for (const entry of videoModelResolutions) {
      expect(typeof entry.model).toBe('string');
      expect(Array.isArray(entry.resolutions)).toBe(true);
      expect(typeof entry.default).toBe('string');
    }
  });
});

describe('getVideoResolutionsByModel', () => {
  it('returns resolutions array for a known model', () => {
    const resolutions = getVideoResolutionsByModel(
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
    );
    expect(resolutions).toEqual([
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ]);
  });

  it('returns empty array for an unknown model', () => {
    expect(getVideoResolutionsByModel('totally-fake-model')).toEqual([]);
  });

  it('returns correct resolutions for WAN video model', () => {
    const resolutions = getVideoResolutionsByModel(
      MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
    );
    expect(resolutions.map((r) => r.value)).toContain('480p');
    expect(resolutions.map((r) => r.value)).toContain('720p');
  });
});

describe('getDefaultVideoResolution', () => {
  it('returns the default resolution for a known model', () => {
    expect(getDefaultVideoResolution(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3)).toBe(
      '1080p',
    );
  });

  it('returns undefined for an unknown model', () => {
    expect(getDefaultVideoResolution('unknown-model')).toBeUndefined();
  });

  it('returns "standard"/"high" for Sora Pro', () => {
    expect(
      getDefaultVideoResolution(MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO),
    ).toBe('high');
  });
});

describe('hasResolutionOptions', () => {
  it('returns true for a model with resolution config', () => {
    expect(hasResolutionOptions(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3)).toBe(true);
  });

  it('returns false for an unknown model', () => {
    expect(hasResolutionOptions('no-such-model')).toBe(false);
  });
});
