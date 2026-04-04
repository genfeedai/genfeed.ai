import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Type of brand asset to resolve
 */
export type BrandAssetType = 'logo' | 'banner' | 'references';

/**
 * Asset dimensions
 */
export interface AssetDimensions {
  width: number;
  height: number;
}

/**
 * Brand Asset Node Data
 *
 * Resolves brand-specific assets (logos, banners, reference images)
 * for use in downstream workflow nodes.
 *
 * Outputs:
 * - image (image): Single resolved asset URL (for logo/banner)
 * - images (image, multiple): Multiple reference images
 */
export interface BrandAssetNodeData extends BaseNodeData {
  // Configuration (user selects brand and asset type in UI)
  brandId: string | null;
  assetType: BrandAssetType;

  // Resolved at execution time (populated from Asset collection)
  resolvedUrl: string | null;
  resolvedUrls: string[];

  // Asset metadata
  dimensions: AssetDimensions | null;
  mimeType: string | null;

  // Brand metadata for display
  brandLabel: string | null;
}

/**
 * Default data for a new Brand Asset node
 */
export const DEFAULT_BRAND_ASSET_DATA: Partial<BrandAssetNodeData> = {
  assetType: 'logo',
  brandId: null,
  brandLabel: null,
  dimensions: null,
  label: 'Brand Asset',
  mimeType: null,
  resolvedUrl: null,
  resolvedUrls: [],
  status: 'idle',
};
