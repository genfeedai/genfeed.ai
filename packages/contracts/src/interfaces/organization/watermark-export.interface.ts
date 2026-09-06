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
