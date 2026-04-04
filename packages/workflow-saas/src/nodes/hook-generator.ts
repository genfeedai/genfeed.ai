/**
 * Hook Generator Node
 *
 * SAAS category node that generates engagement hooks for TikTok slideshows
 * using proven engagement formulas. Outputs hook text, caption opening,
 * curated hashtags, and per-slide image generation prompts.
 */

import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Hook formula templates for engagement-optimized hooks.
 *
 * - person_conflict_resolution: "[Person] + [Conflict] + showed them [Solution]"
 * - curiosity_gap: "I tried [X] for [time] and [unexpected result]"
 * - list_reveal: "[N] things that [outcome] (number [X] is wild)"
 * - transformation: "Before vs After: [topic]"
 * - challenge: "Can [AI/tool] actually [task]?"
 */
export type HookFormula =
  | 'person_conflict_resolution'
  | 'curiosity_gap'
  | 'list_reveal'
  | 'transformation'
  | 'challenge';

/**
 * Tone style applied to generated hook text
 */
export type HookToneStyle =
  | 'storytelling'
  | 'provocative'
  | 'educational'
  | 'humorous'
  | 'dramatic';

/**
 * Hook Generator Node Data
 *
 * Inputs:
 * - trendData (text): Optional trend context from TrendTrigger
 * - brand (brand): Optional brand voice from BrandContext
 *
 * Outputs:
 * - hookText (text): Hook text for slide 1 overlay
 * - captionHook (text): Hook text for post caption opening
 * - hashtags (text[]): Curated hashtag set (max 5)
 * - slidePrompts (text[]): 6 image generation prompts
 */
export interface HookGeneratorNodeData extends BaseNodeData {
  type: 'hookGenerator';

  // Configuration
  niche: string | null;
  product: string | null;
  hookFormula: HookFormula;
  toneStyle: HookToneStyle;

  // Input from connections
  inputTrendData: string | null;
  inputBrandContext: string | null;

  // Output
  outputHookText: string | null;
  outputCaptionHook: string | null;
  outputHashtags: string[];
  outputSlidePrompts: string[];
}

/**
 * Default data for a new Hook Generator node
 */
export const DEFAULT_HOOK_GENERATOR_DATA: Partial<HookGeneratorNodeData> = {
  hookFormula: 'curiosity_gap',
  inputBrandContext: null,
  inputTrendData: null,
  label: 'Hook Generator',
  niche: null,
  outputCaptionHook: null,
  outputHashtags: [],
  outputHookText: null,
  outputSlidePrompts: [],
  product: null,
  status: 'idle',
  toneStyle: 'storytelling',
  type: 'hookGenerator',
};

/**
 * Hook Generator node definition for registry
 */
export const hookGeneratorNodeDefinition = {
  category: 'saas' as const,
  defaultData: DEFAULT_HOOK_GENERATOR_DATA,
  description:
    'Generate viral hooks for TikTok slideshows using proven engagement formulas',
  icon: 'Zap',
  inputs: [
    { id: 'trendData', label: 'Trend Data', required: false, type: 'text' },
    { id: 'brand', label: 'Brand', required: false, type: 'brand' },
  ],
  label: 'Hook Generator',
  outputs: [
    { id: 'hookText', label: 'Hook Text', type: 'text' },
    { id: 'captionHook', label: 'Caption Hook', type: 'text' },
    { id: 'hashtags', label: 'Hashtags', type: 'text[]' },
    { id: 'slidePrompts', label: 'Slide Prompts', type: 'text[]' },
  ],
  type: 'hookGenerator',
};
