/**
 * Brand Node
 *
 * INPUT category node that selects a brand from the organization.
 * Outputs brand context including voice, colors, fonts, and default models.
 * Credentials are included implicitly and resolved server-side.
 *
 * Multiple brand nodes in a workflow = multi-brand workflow.
 */

import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Brand color palette
 */
export interface BrandColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

/**
 * Brand font configuration
 */
export interface BrandFontConfig {
  heading: string;
  body: string;
}

/**
 * Default AI models configured for the brand
 */
export interface BrandDefaultModels {
  video: string | null;
  image: string | null;
  imageToVideo: string | null;
  music: string | null;
  text: string | null;
}

/**
 * Brand Node Data
 *
 * Outputs:
 * - brand (brand): Full brand context object for downstream nodes
 * - voice (text): Brand voice/tone description
 * - colors (object): Color palette
 * - fonts (object): Font configuration
 */
export interface BrandNodeData extends BaseNodeData {
  type: 'brand';

  // Configuration - user selects brand in UI
  brandId: string | null;

  // Resolved at execution time from Brand + Ingredient collections
  resolvedBrandId: string | null;
  resolvedLabel: string | null;
  resolvedHandle: string | null;
  resolvedVoice: string | null;
  resolvedColors: BrandColorPalette | null;
  resolvedFonts: BrandFontConfig | null;
  resolvedModels: BrandDefaultModels | null;
  resolvedLogoUrl: string | null;

  // Credentials are resolved server-side, never exposed to client
  // credentialsResolved: boolean (internal flag, not in data)
}

/**
 * Default data for a new Brand node
 */
export const DEFAULT_BRAND_DATA: Partial<BrandNodeData> = {
  brandId: null,
  label: 'Brand',
  resolvedBrandId: null,
  resolvedColors: null,
  resolvedFonts: null,
  resolvedHandle: null,
  resolvedLabel: null,
  resolvedLogoUrl: null,
  resolvedModels: null,
  resolvedVoice: null,
  status: 'idle',
  type: 'brand',
};

/**
 * Brand node definition for registry
 */
export const brandNodeDefinition = {
  category: 'input' as const,
  defaultData: DEFAULT_BRAND_DATA,
  description:
    'Select a brand from your organization to inject brand context into the workflow',
  icon: 'Store',
  inputs: [],
  label: 'Brand',
  outputs: [
    { id: 'brand', label: 'Brand Context', type: 'brand' },
    { id: 'voice', label: 'Voice', type: 'text' },
    { id: 'colors', label: 'Colors', type: 'object' },
    { id: 'fonts', label: 'Fonts', type: 'object' },
  ],
  type: 'brand',
};
