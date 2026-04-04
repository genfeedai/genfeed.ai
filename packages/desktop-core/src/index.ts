import path from 'node:path';

const METADATA_DIR = '.genfeed';

export function buildWorkspaceMetadataDir(root: string): string {
  return path.join(root, METADATA_DIR);
}

export function buildWorkspaceAssetsDir(root: string): string {
  return path.join(root, METADATA_DIR, 'assets');
}

export function buildWorkspaceDraftsPath(root: string): string {
  return path.join(root, METADATA_DIR, 'content-runs.json');
}

export function buildWorkspaceThreadsPath(root: string): string {
  return path.join(root, METADATA_DIR, 'threads.json');
}

export const DEFAULT_MAX_INDEXED_FILES = 5000;

export function resolvePathInsideRoot(root: string, rel: string): string {
  const resolved = path.resolve(root, rel);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('Path escapes workspace root');
  }

  return resolved;
}
