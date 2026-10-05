/**
 * A color a Library tag can take from its picker. Kept in an import-free leaf
 * so `constants/tag-colors.constant.ts` can type its palette without pulling
 * the interfaces barrel back into `constants` (an import cycle).
 */
export interface ITagColorSwatch {
  backgroundColor: string;
  name: string;
  textColor: string;
}
