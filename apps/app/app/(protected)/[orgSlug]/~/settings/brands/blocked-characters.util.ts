import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { BlockedCharacter } from '@props/characters/characters-page.props';

export const BRAND_OWNS_SHARED_CHARACTERS = 'brand_owns_shared_characters';

/**
 * The shared characters that block a brand deletion, read from the JSON:API
 * error the API returns, or an empty list for any other failure (#6040).
 */
export function readBlockedCharacters(error: unknown): BlockedCharacter[] {
  if (!isRecord(error)) {
    return [];
  }
  const document = isRecord(error.response) ? error.response.data : error;
  if (!isRecord(document) || !Array.isArray(document.errors)) {
    return [];
  }
  const first = document.errors.find(isRecord);
  if (
    !first ||
    first.code !== BRAND_OWNS_SHARED_CHARACTERS ||
    !isRecord(first.source) ||
    !Array.isArray(first.source.characters)
  ) {
    return [];
  }
  return first.source.characters.flatMap((character) =>
    isRecord(character) &&
    typeof character.id === 'string' &&
    typeof character.label === 'string'
      ? [
          {
            handle:
              typeof character.handle === 'string' ? character.handle : null,
            id: character.id,
            label: character.label,
          },
        ]
      : [],
  );
}
