// Model pricing - Source: replicate.com/pricing (Jan 2026)
// Image models: per output image (flat rate)
// Video models: per second of output video
// LLM models: per token

export const PRICING = {
  'imagen-4': 0.15,
  // Legacy aliases
  'imagen-4-fast': 0.039,
  // LLM (per token, derived from $9.50/million)
  llama: 0.0000095,
  // Luma Reframe
  'luma-reframe-image': {
    'photon-1': 0.03,
    'photon-flash-1': 0.01,
  },
  'luma-reframe-video': 0.06, // per second
  // Image generation (per image)
  'nano-banana': 0.039,
  'nano-banana-pro': {
    '1K': 0.15,
    '2K': 0.15,
    '4K': 0.3,
  },
  // Topaz Upscale (tiered by megapixels)
  'topaz-image-upscale': [
    { maxMP: 1, price: 0.05 },
    { maxMP: 4, price: 0.08 },
    { maxMP: 9, price: 0.16 },
    { maxMP: 16, price: 0.27 },
    { maxMP: 25, price: 0.41 },
    { maxMP: Infinity, price: 0.82 },
  ],
  // Topaz Video (per 5 seconds based on resolution and fps)
  'topaz-video-upscale': {
    '4k-15': 0.187,
    '4k-24': 0.299,
    '4k-30': 0.373,
    '4k-60': 0.747,
    '720p-15': 0.014,
    '720p-24': 0.022,
    '720p-30': 0.027,
    '720p-60': 0.054,
    '1080p-15': 0.051,
    '1080p-24': 0.081,
    '1080p-30': 0.101,
    '1080p-60': 0.203,
  },
  'veo-3': { withAudio: 0.4, withoutAudio: 0.2 },
  // Legacy aliases
  'veo-3-fast': { withAudio: 0.15, withoutAudio: 0.1 },
  'veo-3.1': { withAudio: 0.4, withoutAudio: 0.2 },
  // Video generation (per second)
  'veo-3.1-fast': { withAudio: 0.15, withoutAudio: 0.1 },
} as const;

// Type definitions derived from PRICING
export type ImageModel =
  | 'nano-banana'
  | 'nano-banana-pro'
  | 'imagen-4-fast'
  | 'imagen-4';
export type VideoModel = 'veo-3.1-fast' | 'veo-3.1' | 'veo-3-fast' | 'veo-3';
export type LumaImageModel = 'photon-flash-1' | 'photon-1';

// Node type classifications for cost calculation
export const IMAGE_NODE_TYPES = [
  'imageGen',
  'image-gen',
  'ImageGenNode',
] as const;
export const VIDEO_NODE_TYPES = [
  'videoGen',
  'video-gen',
  'VideoGenNode',
] as const;
export const LUMA_NODE_TYPES = [
  'reframe',
  'lumaReframeImage',
  'lumaReframeVideo',
] as const;
export const TOPAZ_NODE_TYPES = [
  'upscale',
  'topazImageUpscale',
  'topazVideoUpscale',
] as const;

// Default video duration (seconds)
export const DEFAULT_VIDEO_DURATION = 8;

// Shared option arrays for UI dropdowns
// These derive from the types in packages/types but provide runtime arrays
export const ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '4:5',
  '5:4',
  '2:3',
  '3:2',
  '21:9',
] as const;

export const VIDEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;

export const RESOLUTIONS = ['1K', '2K', '4K'] as const;

export const VIDEO_RESOLUTIONS = ['720p', '1080p'] as const;

export const VIDEO_DURATIONS = [4, 6, 8] as const;

export const OUTPUT_FORMATS = ['jpg', 'png', 'webp'] as const;

export const LUMA_ASPECT_RATIOS = [
  '1:1',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '9:21',
  '21:9',
] as const;
