/**
 * Fields that decide which stored object a record serves. They are written by
 * the server when an upload or generation completes, never by a client.
 *
 * The global ValidationPipe does not whitelist, so a field omitted from a DTO
 * still reaches the handler. Accepting these would let a caller repoint a
 * record they own at another tenant's object and receive a signed URL for it.
 */
const CLIENT_FORBIDDEN_STORAGE_FIELDS: ReadonlySet<string> = new Set([
  's3Key',
  'cdnUrl',
]);

/** Returns a copy of a client write payload without storage identity. */
export function withoutClientStorageIdentity<T extends object>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => !CLIENT_FORBIDDEN_STORAGE_FIELDS.has(key),
    ),
  ) as T;
}
