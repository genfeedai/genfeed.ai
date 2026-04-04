import { describe, expect, it } from 'vitest';
import {
  ASPECT_RATIOS,
  DEFAULT_VIDEO_DURATION,
  IMAGE_NODE_TYPES,
  LUMA_ASPECT_RATIOS,
  LUMA_NODE_TYPES,
  OUTPUT_FORMATS,
  PRICING,
  RESOLUTIONS,
  TOPAZ_NODE_TYPES,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VIDEO_NODE_TYPES,
  VIDEO_RESOLUTIONS,
} from './pricing';

describe('PRICING constants', () => {
  it('should have nano-banana pricing', () => {
    expect(PRICING['nano-banana']).toBe(0.039);
  });

  it('should have nano-banana-pro with resolution tiers', () => {
    expect(PRICING['nano-banana-pro']['1K']).toBe(0.15);
    expect(PRICING['nano-banana-pro']['2K']).toBe(0.15);
    expect(PRICING['nano-banana-pro']['4K']).toBe(0.3);
  });

  it('should have veo video pricing with audio options', () => {
    expect(PRICING['veo-3.1-fast'].withAudio).toBe(0.15);
    expect(PRICING['veo-3.1-fast'].withoutAudio).toBe(0.1);
  });

  it('should have luma reframe pricing', () => {
    expect(PRICING['luma-reframe-image']['photon-flash-1']).toBe(0.01);
    expect(PRICING['luma-reframe-video']).toBe(0.06);
  });

  it('should have topaz upscale pricing tiers', () => {
    expect(Array.isArray(PRICING['topaz-image-upscale'])).toBe(true);
    expect(PRICING['topaz-image-upscale'][0]).toHaveProperty('maxMP');
    expect(PRICING['topaz-image-upscale'][0]).toHaveProperty('price');
  });

  it('should have topaz video upscale pricing', () => {
    expect(PRICING['topaz-video-upscale']['720p-15']).toBe(0.014);
    expect(PRICING['topaz-video-upscale']['1080p-30']).toBe(0.101);
  });

  it('should have legacy aliases', () => {
    expect(PRICING['imagen-4-fast']).toBe(0.039);
    expect(PRICING['imagen-4']).toBe(0.15);
  });

  it('should have llama pricing', () => {
    expect(PRICING.llama).toBe(0.0000095);
  });
});

describe('Node type constants', () => {
  it('should have IMAGE_NODE_TYPES', () => {
    expect(IMAGE_NODE_TYPES).toContain('imageGen');
    expect(IMAGE_NODE_TYPES).toContain('image-gen');
    expect(IMAGE_NODE_TYPES).toContain('ImageGenNode');
  });

  it('should have VIDEO_NODE_TYPES', () => {
    expect(VIDEO_NODE_TYPES).toContain('videoGen');
    expect(VIDEO_NODE_TYPES).toContain('video-gen');
    expect(VIDEO_NODE_TYPES).toContain('VideoGenNode');
  });

  it('should have LUMA_NODE_TYPES with specific variants', () => {
    expect(LUMA_NODE_TYPES).toContain('reframe');
    expect(LUMA_NODE_TYPES).toContain('lumaReframeImage');
    expect(LUMA_NODE_TYPES).toContain('lumaReframeVideo');
  });

  it('should have TOPAZ_NODE_TYPES with specific variants', () => {
    expect(TOPAZ_NODE_TYPES).toContain('upscale');
    expect(TOPAZ_NODE_TYPES).toContain('topazImageUpscale');
    expect(TOPAZ_NODE_TYPES).toContain('topazVideoUpscale');
  });
});

describe('UI option arrays', () => {
  it('should have ASPECT_RATIOS', () => {
    expect(ASPECT_RATIOS.length).toBeGreaterThan(0);
    expect(ASPECT_RATIOS).toContain('1:1');
    expect(ASPECT_RATIOS).toContain('16:9');
    expect(ASPECT_RATIOS).toContain('9:16');
  });

  it('should have VIDEO_ASPECT_RATIOS', () => {
    expect(VIDEO_ASPECT_RATIOS).toContain('16:9');
    expect(VIDEO_ASPECT_RATIOS).toContain('9:16');
  });

  it('should have LUMA_ASPECT_RATIOS', () => {
    expect(LUMA_ASPECT_RATIOS.length).toBeGreaterThan(0);
    expect(LUMA_ASPECT_RATIOS).toContain('1:1');
  });

  it('should have RESOLUTIONS', () => {
    expect(RESOLUTIONS).toContain('1K');
    expect(RESOLUTIONS).toContain('2K');
    expect(RESOLUTIONS).toContain('4K');
  });

  it('should have VIDEO_RESOLUTIONS', () => {
    expect(VIDEO_RESOLUTIONS).toContain('720p');
    expect(VIDEO_RESOLUTIONS).toContain('1080p');
  });

  it('should have VIDEO_DURATIONS', () => {
    expect(VIDEO_DURATIONS).toContain(4);
    expect(VIDEO_DURATIONS).toContain(6);
    expect(VIDEO_DURATIONS).toContain(8);
  });

  it('should have OUTPUT_FORMATS', () => {
    expect(OUTPUT_FORMATS).toContain('jpg');
    expect(OUTPUT_FORMATS).toContain('png');
    expect(OUTPUT_FORMATS).toContain('webp');
  });

  it('should have DEFAULT_VIDEO_DURATION', () => {
    expect(DEFAULT_VIDEO_DURATION).toBe(8);
  });
});
