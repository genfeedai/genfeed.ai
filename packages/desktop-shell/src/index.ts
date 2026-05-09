import fs from 'node:fs';
import path from 'node:path';

const ensureDataDirectory = (appName: string): string => {
  const baseDir = process.env.GENFEED_DESKTOP_DATA_DIR
    ? path.resolve(process.env.GENFEED_DESKTOP_DATA_DIR)
    : path.join(process.cwd(), '.data');

  const appDir = path.join(baseDir, appName);
  fs.mkdirSync(appDir, { recursive: true });
  return appDir;
};

export function buildDesktopDataDir(appName: string): string {
  return ensureDataDirectory(appName);
}
