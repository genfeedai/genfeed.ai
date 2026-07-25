import type { SortObject } from '@genfeedai/interfaces';

function getDefaultSort(): SortObject {
  return { createdAt: -1 };
}

function isSortFieldCharacter(character: string): boolean {
  const code = character.charCodeAt(0);

  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    code === 95 ||
    (code >= 97 && code <= 122)
  );
}

function isValidSortField(field: string): boolean {
  return field.length > 0 && [...field].every(isSortFieldCharacter);
}

/**
 * Handles field-direction sort query format
 *
 * Format: "field: direction" or "field1: direction1, field2: direction2"
 * - direction: 1 for ascending, -1 for descending
 *
 * Examples:
 * - "createdAt: -1" -> { createdAt: -1 }
 * - "label: 1" -> { label: 1 }
 * - "category: 1, label: -1" -> { category: 1, label: -1 }
 *
 * @param query - Sort query string in MongoDB format
 * @returns sort object
 */
export const handleQuerySort = (
  query: string | undefined | null,
): SortObject => {
  // Default sort if no query provided
  if (!query || query === '') {
    return getDefaultSort();
  }

  const sort: SortObject = {};

  for (const segment of query.split(',')) {
    const separatorIndex = segment.indexOf(':');
    if (separatorIndex < 0 || segment.indexOf(':', separatorIndex + 1) >= 0) {
      return getDefaultSort();
    }

    const field = segment.slice(0, separatorIndex).trim();
    const direction = segment.slice(separatorIndex + 1).trim();

    if (!isValidSortField(field) || (direction !== '1' && direction !== '-1')) {
      return getDefaultSort();
    }

    sort[field] = direction === '1' ? 1 : -1;
  }

  return Object.keys(sort).length > 0 ? sort : getDefaultSort();
};
