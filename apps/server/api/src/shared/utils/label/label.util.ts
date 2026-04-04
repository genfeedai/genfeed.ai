import ShortUniqueId from 'short-unique-id';

/**
 * Singleton instance of ShortUniqueId for generating random labels
 * This ensures consistent random ID generation across the entire application
 */
const uid = new ShortUniqueId({ length: 6 });

/**
 * Generates a random label with an optional prefix
 *
 * @param prefix - Optional prefix to prepend to the generated label (e.g., 'video', 'image')
 * @returns A random label string, optionally prefixed (e.g., 'abc123' or 'video-abc123')
 *
 * @example
 * // Generate a simple label
 * generateLabel() // returns 'abc123'
 *
 * // Generate a prefixed label
 * generateLabel('video') // returns 'video-abc123'
 */
export const generateLabel = (prefix = ''): string => {
  return prefix ? `${prefix}-${uid.rnd()}` : uid.rnd();
};
