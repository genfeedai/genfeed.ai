export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/** Which of a brand's marks an export uses: the default, one for light footage or one for livestreams. */
export type WatermarkVariant = 'default' | 'light' | 'live';

export const WATERMARK_VARIANTS: readonly WatermarkVariant[] = [
  'default',
  'light',
  'live',
];

export interface IWatermarkLayer {
  text?: string;
  logoStorageKey?: string;
  opacity: number;
  position: WatermarkPosition;
  /** Width of the mark as a share of the canvas width. */
  sizeRatio?: number;
  /** Distance from the left or right edge as a share of the canvas width. */
  insetXRatio?: number;
  /** Distance from the top or bottom edge as a share of the canvas width. */
  insetYRatio?: number;
}

export interface IWatermarkExportRequest {
  /**
   * Identity of everything the rendered bytes depend on. When set, the stored
   * copy is addressed by it, so a repeat request returns the stored copy without
   * fetching or encoding the source again.
   */
  cacheKey?: string;
  storageKey: string;
  category: 'images' | 'videos';
  layers: IWatermarkLayer[];
}

export interface IWatermarkExportResult {
  url: string;
  storageKey: string;
}

export interface IIngredientExportResult {
  url: string;
  filename: string;
}
