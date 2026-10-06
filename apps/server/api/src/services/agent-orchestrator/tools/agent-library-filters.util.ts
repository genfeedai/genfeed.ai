import {
  type IngredientOrigin,
  type LibraryShelf,
  parseIngredientOrigin,
  parseLibraryShelf,
  parseTagMatchMode,
  type TagMatchMode,
} from '@genfeedai/contracts';

export function readAgentLibraryFilters(
  params: Record<string, unknown>,
):
  | { origin?: IngredientOrigin; shelf?: LibraryShelf; tagMatch?: TagMatchMode }
  | { error: string } {
  const rawOrigin = params.origin;
  const hasOrigin =
    rawOrigin !== undefined && rawOrigin !== null && rawOrigin !== '';
  const origin = hasOrigin ? parseIngredientOrigin(rawOrigin) : undefined;
  if (hasOrigin && !origin) {
    return {
      error: 'origin must be UPLOADED, GENERATED, IMPORTED or UNKNOWN.',
    };
  }

  const hasShelf =
    params.shelf !== undefined && params.shelf !== null && params.shelf !== '';
  const shelf = hasShelf ? parseLibraryShelf(params.shelf) : undefined;
  if (hasShelf && !shelf) {
    return { error: 'shelf must be a valid Library shelf.' };
  }

  const rawTagMatch = params.tagMatch;
  const hasTagMatch =
    rawTagMatch !== undefined && rawTagMatch !== null && rawTagMatch !== '';
  const tagMatch = hasTagMatch ? parseTagMatchMode(rawTagMatch) : undefined;
  if (hasTagMatch && !tagMatch) {
    return { error: 'tagMatch must be any or all.' };
  }

  return { origin, shelf, tagMatch };
}
