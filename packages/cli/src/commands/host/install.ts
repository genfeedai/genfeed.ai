import { existsSync, realpathSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NATIVE_HOST_NAME } from '@genfeedai/contracts/constants';
import { emptyHostConfig, type HostPaths, readHostConfig, writeHostConfig } from './config';
import { extensionOrigin, resolveAllowedExtensionIds } from './extension-identity';

export const SUPPORTED_BROWSERS = ['chrome', 'chromium', 'brave', 'edge'] as const;
export type BrowserId = (typeof SUPPORTED_BROWSERS)[number];

export type HostPlatform = 'darwin' | 'linux';

const BROWSER_USER_DATA: Record<BrowserId, Record<HostPlatform, string[]>> = {
  brave: {
    darwin: ['Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'],
    linux: ['.config', 'BraveSoftware', 'Brave-Browser'],
  },
  chrome: {
    darwin: ['Library', 'Application Support', 'Google', 'Chrome'],
    linux: ['.config', 'google-chrome'],
  },
  chromium: {
    darwin: ['Library', 'Application Support', 'Chromium'],
    linux: ['.config', 'chromium'],
  },
  edge: {
    darwin: ['Library', 'Application Support', 'Microsoft Edge'],
    linux: ['.config', 'microsoft-edge'],
  },
};

export class UnsupportedPlatformError extends Error {
  constructor(platform: string) {
    super(`gf host install supports macOS and Linux, not ${platform}.`);
    this.name = 'UnsupportedPlatformError';
  }
}

export function toHostPlatform(platform: NodeJS.Platform): HostPlatform {
  if (platform === 'darwin' || platform === 'linux') return platform;
  throw new UnsupportedPlatformError(platform);
}

export function browserUserDataDirectory(
  browser: BrowserId,
  platform: HostPlatform,
  homeDirectory: string
): string {
  return path.join(homeDirectory, ...BROWSER_USER_DATA[browser][platform]);
}

export function manifestPath(
  browser: BrowserId,
  platform: HostPlatform,
  homeDirectory: string
): string {
  return path.join(
    browserUserDataDirectory(browser, platform, homeDirectory),
    'NativeMessagingHosts',
    `${NATIVE_HOST_NAME}.json`
  );
}

export interface HostManifest {
  allowed_origins: string[];
  description: string;
  name: string;
  path: string;
  type: 'stdio';
}

export function buildHostManifest(
  launcherPath: string,
  extensionIds: readonly string[]
): HostManifest {
  return {
    allowed_origins: extensionIds.map(extensionOrigin),
    description:
      'Genfeed local AI bridge: runs your own AI CLI or API key for the Genfeed extension',
    name: NATIVE_HOST_NAME,
    path: launcherPath,
    type: 'stdio',
  };
}

export interface LauncherTarget {
  /** Extra leading argument: the CLI entry script when the CLI runs under Node or Bun. */
  script: string | null;
  runtime: string;
}

/** How to start this same CLI again: its runtime and, unless it is a single binary, its script. */
export function resolveLauncherTarget(
  execPath: string,
  entryScript: string | undefined
): LauncherTarget {
  if (!entryScript || entryScript === execPath || entryScript.startsWith('/$bunfs/')) {
    return { runtime: execPath, script: null };
  }
  const script = existsSync(entryScript) ? realpathSync(entryScript) : entryScript;
  if (script.split(path.sep).includes('_npx')) {
    throw new Error(
      'gf is running from a temporary npx cache. Install it globally, then run `gf host install`.'
    );
  }
  return { runtime: execPath, script };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'\\''`)}'`;
}

/**
 * The file Chrome starts. Chrome gives hosts a minimal environment, so the
 * launcher pins the PATH the user had at install time; every path is
 * single-quoted so none can be read as shell syntax.
 */
export function renderLauncher(target: LauncherTarget, pathValue: string): string {
  const command = [target.runtime, ...(target.script ? [target.script] : [])]
    .map(shellQuote)
    .join(' ');
  return [
    '#!/bin/sh',
    '# Written by `gf host install`. Chrome starts this file; run `gf host install` again to change it.',
    `PATH=${shellQuote(pathValue)}`,
    'export PATH',
    `exec ${command} host serve "$@"`,
    '',
  ].join('\n');
}

export interface InstallOptions {
  browsers: readonly BrowserId[] | null;
  extraExtensionIds: readonly string[];
  homeDirectory: string;
  paths: HostPaths;
  pathValue: string;
  platform: HostPlatform;
  target: LauncherTarget;
}

export interface InstallReport {
  allowedOrigins: string[];
  launcherPath: string;
  manifests: Array<{ browser: BrowserId; path: string }>;
  skippedBrowsers: BrowserId[];
}

/**
 * Registers the host with each browser. With no browser named, every browser
 * whose profile directory exists gets it; a named browser always does.
 */
export async function installHost(options: InstallOptions): Promise<InstallReport> {
  const extensionIds = resolveAllowedExtensionIds(options.extraExtensionIds);
  const explicit = options.browsers !== null;
  const requested = options.browsers ?? SUPPORTED_BROWSERS;
  const targets: BrowserId[] = [];
  const skippedBrowsers: BrowserId[] = [];
  for (const browser of requested) {
    const profile = browserUserDataDirectory(browser, options.platform, options.homeDirectory);
    if (explicit || existsSync(profile)) targets.push(browser);
    else skippedBrowsers.push(browser);
  }
  if (targets.length === 0) {
    throw new Error(
      'No supported browser profile was found. Pass --browser chrome|chromium|brave|edge to register one anyway.'
    );
  }

  await mkdir(options.paths.hostDirectory, { mode: 0o700, recursive: true });
  await chmod(options.paths.hostDirectory, 0o700);
  await writeFile(options.paths.launcherPath, renderLauncher(options.target, options.pathValue), {
    encoding: 'utf8',
    mode: 0o755,
  });
  await chmod(options.paths.launcherPath, 0o755);

  const allowedOrigins = extensionIds.map(extensionOrigin);
  const config = await readHostConfig(options.paths).catch(() => emptyHostConfig());
  await writeHostConfig(options.paths, { ...config, allowedOrigins });

  const manifest = buildHostManifest(options.paths.launcherPath, extensionIds);
  const manifests: InstallReport['manifests'] = [];
  for (const browser of targets) {
    const file = manifestPath(browser, options.platform, options.homeDirectory);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    manifests.push({ browser, path: file });
  }
  return { allowedOrigins, launcherPath: options.paths.launcherPath, manifests, skippedBrowsers };
}

export interface UninstallOptions {
  homeDirectory: string;
  paths: HostPaths;
  platform: HostPlatform;
  /** Also delete the host config, including any saved API keys. */
  shouldPurge: boolean;
}

export async function uninstallHost(options: UninstallOptions): Promise<{ removed: string[] }> {
  const removed: string[] = [];
  const remove = async (file: string): Promise<void> => {
    if (existsSync(file)) {
      await rm(file, { force: true });
      removed.push(file);
    }
  };
  for (const browser of SUPPORTED_BROWSERS) {
    await remove(manifestPath(browser, options.platform, options.homeDirectory));
  }
  await remove(options.paths.launcherPath);
  if (options.shouldPurge) {
    await remove(options.paths.configPath);
  } else if (existsSync(options.paths.configPath)) {
    const config = await readHostConfig(options.paths).catch(() => null);
    if (config) await writeHostConfig(options.paths, { ...config, allowedOrigins: [] });
  }
  return { removed };
}

export interface InstalledManifest {
  allowedOrigins: string[];
  browser: BrowserId;
  isLauncherExecutable: boolean;
  path: string;
}

/** Reads back what is registered, without running the host. */
export async function readInstalledManifests(
  platform: HostPlatform,
  homeDirectory: string
): Promise<InstalledManifest[]> {
  const found: InstalledManifest[] = [];
  for (const browser of SUPPORTED_BROWSERS) {
    const file = manifestPath(browser, platform, homeDirectory);
    let manifest: Partial<HostManifest>;
    try {
      manifest = JSON.parse(await readFile(file, 'utf8')) as Partial<HostManifest>;
    } catch {
      continue;
    }
    const launcher = typeof manifest.path === 'string' ? manifest.path : '';
    const launcherStat = launcher ? await stat(launcher).catch(() => null) : null;
    found.push({
      allowedOrigins: Array.isArray(manifest.allowed_origins) ? manifest.allowed_origins : [],
      browser,
      isLauncherExecutable: launcherStat !== null && (launcherStat.mode & 0o111) !== 0,
      path: file,
    });
  }
  return found;
}
