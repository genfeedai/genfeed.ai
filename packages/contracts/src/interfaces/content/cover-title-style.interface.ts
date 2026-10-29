import type { IWatermarkLayer } from '../organization/watermark-export.interface';

export type CoverTitlePlacement = 'bottom' | 'top-left';
export type CoverTitleTextCase = 'as-is' | 'upper';

/**
 * How the title on a video cover looks. Every field is optional; the files
 * service fills the rest with a plain white title on a bottom scrim.
 */
export interface ICoverTitleStyle {
  /** `#RRGGBB` of the last word. Omit to draw the whole title in `color`. */
  accentColor?: string;
  /** `#RRGGBB`. */
  color?: string;
  /** `FontFamily` label or key. Unknown values use the default cover font. */
  fontFamily?: string;
  /** `bottom` is centred on a dark scrim; `top-left` is stacked, no scrim. */
  placement?: CoverTitlePlacement;
  textCase?: CoverTitleTextCase;
}

/** What a cover is dressed with: the title style and the brand signature. */
export interface ICoverStyle {
  /** The brand mark laid over the cover, placed like an export watermark. */
  signature?: IWatermarkLayer;
  title?: ICoverTitleStyle;
}
