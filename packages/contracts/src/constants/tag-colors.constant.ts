import type { ITagColorSwatch } from '../interfaces/content/tag-color.interface';

/**
 * The colors a Library tag can take from its picker. Each pairs a background
 * with a text color that keeps AA contrast, and every swatch reads on both the
 * light and the dark theme.
 */
export const TAG_COLOR_PALETTE: readonly ITagColorSwatch[] = [
  { backgroundColor: '#64748B', name: 'Slate', textColor: '#FFFFFF' },
  { backgroundColor: '#DC2626', name: 'Red', textColor: '#FFFFFF' },
  { backgroundColor: '#F97316', name: 'Orange', textColor: '#000000' },
  { backgroundColor: '#FBBF24', name: 'Amber', textColor: '#000000' },
  { backgroundColor: '#84CC16', name: 'Lime', textColor: '#000000' },
  { backgroundColor: '#15803D', name: 'Green', textColor: '#FFFFFF' },
  { backgroundColor: '#2DD4BF', name: 'Teal', textColor: '#000000' },
  { backgroundColor: '#38BDF8', name: 'Sky', textColor: '#000000' },
  { backgroundColor: '#2563EB', name: 'Blue', textColor: '#FFFFFF' },
  { backgroundColor: '#7C3AED', name: 'Violet', textColor: '#FFFFFF' },
  { backgroundColor: '#DB2777', name: 'Pink', textColor: '#FFFFFF' },
  { backgroundColor: '#A16207', name: 'Brown', textColor: '#FFFFFF' },
];

/**
 * The swatch a new tag starts with when its creator picked none. It follows
 * the label, so the same label gets the same color in every brand.
 */
export function pickTagColor(label: string): ITagColorSwatch {
  let hash = 0;
  for (const character of label.trim().toLowerCase()) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }

  return TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length];
}
