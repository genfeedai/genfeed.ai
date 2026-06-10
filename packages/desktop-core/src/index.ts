import fs from 'node:fs';
import path from 'node:path';

const METADATA_DIR = '.genfeed';

export function buildDesktopDataDir(appName: string): string {
  const baseDir = process.env.GENFEED_DESKTOP_DATA_DIR
    ? path.resolve(process.env.GENFEED_DESKTOP_DATA_DIR)
    : path.join(process.cwd(), '.data');

  const appDir = path.join(baseDir, appName);
  fs.mkdirSync(appDir, { recursive: true });
  return appDir;
}

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
