import type { SortObject } from '@genfeedai/interfaces';

/**
 * Handles MongoDB-style sort query format
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
 * @returns MongoDB sort object
 */
export const handleQuerySort = (
  query: string | undefined | null,
): SortObject => {
  // Default sort if no query provided
  if (!query || query === '') {
    return { createdAt: -1 };
  }

  try {
    // Convert the string to JSON object format
    // Example: "id: -1, name: 1" to '{ "id": -1, "name": 1 }'
    const toJSONString = `{${query}}`.replace(/(\w+:)|(\w+ :)/g, (matched) => {
      return `"${matched.substring(0, matched.length - 1)}":`;
    });

    return JSON.parse(toJSONString) as SortObject;
  } catch {
    // Note: Logger not available in utility function - silent fallback to default sort
    return { createdAt: -1 }; // Fallback to default sort
  }
};
