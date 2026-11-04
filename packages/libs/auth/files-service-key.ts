/**
 * Every route of the files service, apart from health, requires the internal
 * service key in this header. The files service checks it in one app-wide
 * guard; every caller attaches it with `filesServiceAuthHeaders`.
 */
export const FILES_SERVICE_KEY_HEADER = 'x-api-key';

export type FilesServiceKeyReader = (
  key: 'GENFEEDAI_API_KEY',
) => string | undefined;

/** The configured internal service key, or `''` when none is set. */
export function readFilesServiceKey(read: FilesServiceKeyReader): string {
  return read('GENFEEDAI_API_KEY')?.trim() ?? '';
}

/**
 * Headers that authenticate one request to the files service. Empty when no
 * key is configured, so the files service answers 503 rather than receiving a
 * blank key.
 */
export function filesServiceAuthHeaders(
  read: FilesServiceKeyReader,
): Record<string, string> {
  const key = readFilesServiceKey(read);
  return key ? { [FILES_SERVICE_KEY_HEADER]: key } : {};
}
