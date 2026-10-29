export type CaptionBurnPosition = 'top' | 'center' | 'bottom';
export type CaptionBurnTextCase = 'as-is' | 'upper';

/**
 * How burned-in captions look. Every field is optional; the files service
 * fills the rest from `DEFAULT_CAPTION_BURN_STYLE`.
 */
export interface ICaptionBurnStyle {
  /** `FontFamily` label or key. Unknown values use the default caption font. */
  fontFamily?: string;
  /** `#RRGGBB`. */
  fontColor?: string;
  /** `#RRGGBB` of the word being spoken. Omit to draw every word in `fontColor`. */
  activeWordColor?: string;
  /** Font height as a share of the video's shorter side. */
  fontSizeRatio?: number;
  position?: CaptionBurnPosition;
  /** For `bottom`: where the block's bottom edge sits, as a share of the height. */
  bottomAnchorRatio?: number;
  textCase?: CaptionBurnTextCase;
  /** `#RRGGBB` of a full-width band behind the lines. Omit for an outline. */
  backgroundColor?: string;
  /** 0 to 1. Ignored without a `backgroundColor`. */
  backgroundOpacity?: number;
  maxLines?: number;
  maxWordsPerGroup?: number;
}
