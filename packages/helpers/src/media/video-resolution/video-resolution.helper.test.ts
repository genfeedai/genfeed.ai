import { MODEL_KEYS } from '@genfeedai/contracts/constants';
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
      { isDraft: true, label: '720p · Draft', value: '720p' },
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

  it('returns the official MiniMax H3 resolution values', () => {
    expect(getVideoResolutionsByModel(MODEL_KEYS.REPLICATE_MINIMAX_H3)).toEqual(
      [
        { isDraft: true, label: '768P · Draft', value: '768P' },
        { label: '2K', value: '2K' },
      ],
    );
  });

  it('returns the official MiniMax H3 Max fal resolution values', () => {
    expect(getVideoResolutionsByModel(MODEL_KEYS.FAL_MINIMAX_H3_MAX)).toEqual([
      { isDraft: true, label: '480P · Draft', value: '480P' },
      { label: '768P', value: '768P' },
    ]);
    expect(getDefaultVideoResolution(MODEL_KEYS.FAL_MINIMAX_H3_MAX)).toBe(
      '768P',
    );
  });

  it('lists only the two resolutions published for Seedance 2.5', () => {
    expect(
      getVideoResolutionsByModel(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5),
    ).toEqual([
      { isDraft: true, label: '480p · Draft', value: '480p' },
      { label: '720p', value: '720p' },
    ]);
  });

  it('uses provider-native Kling modes behind resolution labels', () => {
    expect(
      getVideoResolutionsByModel(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
      ),
    ).toEqual([
      { isDraft: true, label: '720p · Draft', value: 'standard' },
      { label: '1080p', value: 'pro' },
      { label: '4K', value: '4k' },
    ]);
  });

  it('does not expose 360p when the catalog model does not advertise it', () => {
    for (const entry of videoModelResolutions) {
      expect(
        entry.resolutions.map((resolution) => resolution.value),
      ).not.toContain('360p');
    }
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

  it('defaults MiniMax H3 to its conservative billed 2K tier', () => {
    expect(getDefaultVideoResolution(MODEL_KEYS.REPLICATE_MINIMAX_H3)).toBe(
      '2K',
    );
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
