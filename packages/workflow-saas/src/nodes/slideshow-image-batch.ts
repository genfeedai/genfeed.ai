/**
 * Slideshow Image Batch Node
 *
 * SAAS category node that orchestrates generating a batch of consistent
 * images for a TikTok slideshow. Uses a shared base prompt with per-slide
 * style modifiers and a shared seed to maintain visual consistency across slides.
 */

import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Aspect ratio presets for TikTok slideshows
 */
export type SlideshowAspectRatio =
  | 'tiktok_portrait'
  | 'tiktok_square'
  | 'custom';

/**
 * Dimension mapping for each aspect ratio preset
 */
export const SLIDESHOW_DIMENSIONS: Record<
  SlideshowAspectRatio,
  { width: number; height: number }
> = {
  custom: { height: 1080, width: 1080 },
  tiktok_portrait: { height: 1350, width: 1080 },
  tiktok_square: { height: 1080, width: 1080 },
};

/**
 * Default per-slide style modifiers for a 6-slide TikTok slideshow
 */
export const DEFAULT_STYLE_MODIFIERS: string[] = [
  'dramatic front-facing hero shot, bold lighting',
  'candid side angle, natural environment',
  'close-up detail shot, shallow depth of field',
  'wide establishing shot, environmental context',
  'dynamic action pose, motion blur background',
  'warm golden hour, aspirational lifestyle',
];

/**
 * Slideshow Image Batch Node Data
 *
 * Inputs:
 * - slidePrompts (text[]): Per-slide prompts from HookGenerator
 * - basePrompt (text): Optional shared base prompt override
 *
 * Outputs:
 * - images (image[]): Generated image URLs (one per slide)
 */
export interface SlideshowImageBatchNodeData extends BaseNodeData {
  type: 'slideshowImageBatch';

  // Configuration
  slideCount: number;
  basePrompt: string | null;
  styleModifiers: string[];
  aspectRatio: SlideshowAspectRatio;
  model: string | null;
  seed: number | null;

  // Input from connections
  inputSlidePrompts: string[] | null;
  inputBasePrompt: string | null;

  // Output
  outputImageUrls: string[];
  outputJobIds: string[];
}

/**
 * Default data for a new Slideshow Image Batch node
 */
export const DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA: Partial<SlideshowImageBatchNodeData> =
  {
    aspectRatio: 'tiktok_portrait',
    basePrompt: null,
    inputBasePrompt: null,
    inputSlidePrompts: null,
    label: 'Slideshow Image Batch',
    model: null,
    outputImageUrls: [],
    outputJobIds: [],
    seed: null,
    slideCount: 6,
    status: 'idle',
    styleModifiers: [...DEFAULT_STYLE_MODIFIERS],
    type: 'slideshowImageBatch',
  };

/**
 * Slideshow Image Batch node definition for registry
 */
export const slideshowImageBatchNodeDefinition = {
  category: 'saas' as const,
  defaultData: DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA,
  description:
    'Generate a batch of consistent images for TikTok slideshow posts',
  icon: 'Images',
  inputs: [
    {
      id: 'slidePrompts',
      label: 'Slide Prompts',
      required: false,
      type: 'text[]',
    },
    {
      id: 'basePrompt',
      label: 'Base Prompt',
      required: false,
      type: 'text',
    },
  ],
  label: 'Slideshow Image Batch',
  outputs: [
    { id: 'images', label: 'Slide Images', multiple: true, type: 'image' },
  ],
  type: 'slideshowImageBatch',
};
