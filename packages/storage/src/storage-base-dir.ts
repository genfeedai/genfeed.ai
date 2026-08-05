import os from 'node:os';
import path from 'node:path';
import { isDesktopClient, isSelfHostedDeployment } from '@genfeedai/config';

/** Subdirectory carved out of the desktop data root for stored objects. */
const DESKTOP_STORAGE_DIR = 'files';

/**
 * Resolve the filesystem root the local storage driver owns.
 *
 * Single source of truth for both the driver and the `/local` static mount in
 * the files service — the two must agree byte-for-byte or a stored object is
 * written where nothing serves it.
 *
 * Precedence, first match wins:
 *
 * 1. an explicit `baseDir` from `StorageProviderOptions`
 * 2. `GENFEED_STORAGE_PATH`, the deployment-level override
 * 3. desktop-local (`self-hosted × desktop`) → `<GENFEED_DESKTOP_DATA_DIR>/files`,
 *    where the desktop shell exports Electron's `userData` directory
 * 4. `~/.genfeed/data/files` for a plain self-hosted install
 *
 * Cloud deployments never reach this function: `createStorageProvider()` picks
 * the S3 driver before a base directory is ever needed.
 */
export function resolveLocalStorageBaseDir(baseDir?: string): string {
  if (baseDir) {
    return path.resolve(baseDir);
  }

  const configuredPath = process.env.GENFEED_STORAGE_PATH;
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  const desktopDataDir = process.env.GENFEED_DESKTOP_DATA_DIR;
  if (desktopDataDir && isSelfHostedDeployment() && isDesktopClient()) {
    return path.join(path.resolve(desktopDataDir), DESKTOP_STORAGE_DIR);
  }

  return path.join(os.homedir(), '.genfeed', 'data', 'files');
}
