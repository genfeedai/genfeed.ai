/** What a preset example shows: a picture or a clip. A photo edit shows a picture. */
export type PresetExampleMediaType = 'image' | 'video';

/**
 * One real run of a catalog preset, shown beside the preset before anyone
 * spends credits on it. The URL is permanent and public, on the Genfeed CDN.
 */
export interface PresetExample {
  /** One line that says what the picture or clip shows. */
  alt: string;
  /** Width to height, like `9:16`. */
  aspectRatio: string;
  mediaType: PresetExampleMediaType;
  /** A video example carries the still that stands in for it on a card. */
  posterUrl?: string;
  /** A photo edit example carries the picture it started from. */
  sourceUrl?: string;
  url: string;
}
