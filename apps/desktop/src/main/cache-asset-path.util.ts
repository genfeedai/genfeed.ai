import path from 'node:path';

/**
 * Resolves a renderer-supplied cache asset name to a file inside the cache
 * directory. The renderer is the hosted web origin, so the name is untrusted:
 * only a bare file name is accepted, never a path that leaves `cachePath`.
 */
export function resolveCacheAssetPath(
  cachePath: string,
  filename: unknown,
): string {
  if (
    typeof filename !== 'string' ||
    filename === '' ||
    filename === '.' ||
    filename === '..' ||
    filename !== path.basename(filename) ||
    filename !== path.win32.basename(filename)
  ) {
    throw new Error('Invalid cache asset filename');
  }

  return path.join(cachePath, filename);
}
