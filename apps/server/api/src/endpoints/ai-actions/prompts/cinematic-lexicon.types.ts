export type CinematicLexiconCategory =
  | 'camera-movement'
  | 'framing-composition'
  | 'lens-optics'
  | 'lighting'
  | 'color-grade'
  | 'editing-transitions'
  | 'stylistic-effects';

export interface CinematicTechnique {
  aliases: readonly string[];
  category: CinematicLexiconCategory;
  definition: string;
  name: string;
  whenToUse: string;
}

export function technique(
  category: CinematicLexiconCategory,
  name: string,
  definition: string,
  whenToUse: string,
  aliases: readonly string[] = [],
): CinematicTechnique {
  return { aliases, category, definition, name, whenToUse };
}
