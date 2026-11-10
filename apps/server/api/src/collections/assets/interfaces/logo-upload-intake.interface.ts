/** What a logo or banner upload sends to storage and records on the asset. */
export interface ILogoUploadIntake {
  /** The bytes the files service stores (and rasterizes, for an SVG). */
  body: Buffer;
  contentType: string;
  originalFormat?: string;
  originalWidth?: number;
  originalHeight?: number;
  /** The sanitized SVG original, kept beside the raster. */
  vector?: Buffer;
}
