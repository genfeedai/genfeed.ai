import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Brand color palette resolved from the Brand entity
 */
export interface BrandColors {
  primary: string;
  secondary: string;
  background: string;
}

/**
 * Default AI models configured for the brand
 */
export interface BrandModels {
  video: string | null;
  image: string | null;
  imageToVideo: string | null;
  music: string | null;
}

/**
 * Brand Context Node Data
 *
 * Injects brand styling context (voice, colors, fonts, default models)
 * into downstream workflow nodes.
 *
 * Outputs:
 * - voice (text): Brand voice/tone description
 * - colors (text): JSON color palette
 * - fonts (text): Font family name
 * - models (text): Default model preferences
 */
export interface BrandContextNodeData extends BaseNodeData {
  // Configuration (user selects brand in UI)
  brandId: string | null;

  // Resolved at execution time (populated from Brand + Ingredient collections)
  resolvedVoice: string | null;
  resolvedColors: BrandColors | null;
  resolvedFonts: string | null;
  resolvedModels: BrandModels | null;

  // Brand metadata for display
  brandLabel: string | null;
  brandHandle: string | null;
}

/**
 * Default data for a new Brand Context node
 */
export const DEFAULT_BRAND_CONTEXT_DATA: Partial<BrandContextNodeData> = {
  brandHandle: null,
  brandId: null,
  brandLabel: null,
  label: 'Brand Context',
  resolvedColors: null,
  resolvedFonts: null,
  resolvedModels: null,
  resolvedVoice: null,
  status: 'idle',
};
