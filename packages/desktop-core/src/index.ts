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

/**
 * `resolvePathInsideRoot` compares text only, so a symlink inside the folder
 * that points elsewhere passes it. This also follows links: the deepest part
 * of the path that exists must resolve to somewhere inside the folder's real
 * location, and a link that cannot be resolved is refused.
 */
export function resolveRealPathInsideRoot(root: string, rel: string): string {
  const realRoot = fs.realpathSync(root);
  const resolved = resolvePathInsideRoot(realRoot, rel);

  let probe = resolved;
  for (;;) {
    try {
      fs.lstatSync(probe);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error('Path escapes workspace root');
      }
      const parent = path.dirname(probe);
      if (parent === probe) {
        throw new Error('Path escapes workspace root');
      }
      probe = parent;
    }
  }

  let realProbe: string;
  try {
    realProbe = fs.realpathSync(probe);
  } catch {
    throw new Error('Path escapes workspace root');
  }

  if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) {
    throw new Error('Path escapes workspace root');
  }

  return resolved;
}
