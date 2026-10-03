/** Canonical database-backed S3 identity; percent escapes remain literal bytes. */
export function assertStoredObjectKey(
  key: string,
  createError: (message: string) => Error,
): string {
  if (
    typeof key !== 'string' ||
    key.length === 0 ||
    key.startsWith('/') ||
    /^https?:\/\//i.test(key) ||
    key.includes('\\') ||
    [...key].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    key
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw createError('Invalid stored object key');
  }
  return key;
}
