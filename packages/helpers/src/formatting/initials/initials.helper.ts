const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Shown when a name has no letter or digit to take initials from. */
export const INITIALS_PLACEHOLDER = '?';

function firstLetterOrDigit(word: string): string {
  for (const character of word) {
    if (LETTER_OR_DIGIT.test(character)) {
      return character;
    }
  }
  return '';
}

/**
 * The one initials rule for every avatar: the first letter of the first word,
 * plus the first letter of the last word when there is more than one.
 *
 * "Ada Lovelace" is "AL", "Ada Augusta King" is "AK", "Genfeed" is "G", and
 * "@shipshit.dev" is "S". Punctuation and leading `@` are skipped, and a name
 * with nothing to read gives `?`.
 */
export function getInitials(name?: string | null): string {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .map(firstLetterOrDigit)
    .filter(Boolean);

  if (words.length === 0) {
    return INITIALS_PLACEHOLDER;
  }

  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : '';
  return `${first}${last}`.toLocaleUpperCase();
}
