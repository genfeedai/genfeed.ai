export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface IWatermarkLayer {
  text?: string;
  logoStorageKey?: string;
  opacity: number;
  position: WatermarkPosition;
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
