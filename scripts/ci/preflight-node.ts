/**
 * The Node release PR CI runs (`.node-version`), provisioned for preflight.
 *
 * Some executable contracts, such as scripts/ci/runtime-acceptance.test.mjs,
 * refuse any host that is not the pinned Node major. A cloud container ships
 * an older Node, so without this a local run fails six tests CI passes. The
 * release comes from nodejs.org, is verified against its published SHASUMS256
 * list, and is cached outside the repository. Nothing is installed globally.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const NODE_DIST_URL = 'https://nodejs.org/dist';
const LEADING_V_PATTERN = /^v/u;
const WHITESPACE_PATTERN = /\s+/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

export type NodeArchive = {
  /** Archive file name, e.g. `node-v26.12.1-linux-x64.tar.xz`. */
  fileName: string;
  /** Directory the archive extracts to, e.g. `node-v26.12.1-linux-x64`. */
  directory: string;
  /** `tar` flags that extract this archive. */
  tarFlags: string;
};

/** Maps a host to its nodejs.org archive, or null when preflight cannot fetch one. */
export function nodeArchiveFor(
  version: string,
  platform: NodeJS.Platform,
  arch: string,
): NodeArchive | null {
  if (!VERSION_PATTERN.test(version)) return null;
  const nodeArch = arch === 'x64' || arch === 'arm64' ? arch : null;
  if (!nodeArch) return null;
  if (platform === 'linux') {
    const directory = `node-v${version}-linux-${nodeArch}`;
    return { directory, fileName: `${directory}.tar.xz`, tarFlags: '-xJf' };
  }
  if (platform === 'darwin') {
    const directory = `node-v${version}-darwin-${nodeArch}`;
    return { directory, fileName: `${directory}.tar.gz`, tarFlags: '-xzf' };
  }
  return null;
}

/** True when the running Node already is the pinned major. */
export function isPinnedNode(hostVersion: string, pinned: string): boolean {
  const hostMajor = hostVersion.replace(LEADING_V_PATTERN, '').split('.')[0];
  return hostMajor === pinned.split('.')[0];
}

export function parseChecksum(
  shasums: string,
  fileName: string,
): string | null {
  for (const line of shasums.split('\n')) {
    const [hash, name] = line.trim().split(WHITESPACE_PATTERN);
    if (name === fileName && hash && SHA256_PATTERN.test(hash)) return hash;
  }
  return null;
}

function curl(url: string, output: string): void {
  const result = spawnSync(
    'curl',
    ['-fsSL', '--retry', '3', '-o', output, url],
    {
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) throw new Error(`Download failed: ${url}`);
}

function hostNodeVersion(): string | null {
  const result = spawnSync('node', ['--version'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

export type PinnedNode = {
  /** Directory to put first on PATH, or null when the host Node is fine. */
  binDir: string | null;
  note: string;
};

/**
 * Returns the bin directory of the pinned Node, downloading it once. Never
 * throws: a host without network access falls back to its own Node and says so.
 */
export function ensurePinnedNode(rootDir: string): PinnedNode {
  const versionFile = path.join(rootDir, '.node-version');
  if (!existsSync(versionFile)) {
    return { binDir: null, note: 'no .node-version; using the host Node' };
  }
  const pinned = readFileSync(versionFile, 'utf8').trim();
  // Not `process.version`: under Bun that is Bun's Node-compat version, while
  // the contracts spawn the real `node` from PATH.
  const hostNode = hostNodeVersion();
  if (hostNode && isPinnedNode(hostNode, pinned)) {
    return {
      binDir: null,
      note: `host Node ${hostNode} matches .node-version`,
    };
  }

  const archive = nodeArchiveFor(pinned, process.platform, process.arch);
  if (!archive) {
    return {
      binDir: null,
      note: `host Node ${hostNode ?? 'unknown'} differs from ${pinned} and no download exists for ${process.platform}-${process.arch}`,
    };
  }

  const cacheRoot = path.join(
    process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache'),
    'genfeed-preflight',
  );
  const binDir = path.join(cacheRoot, archive.directory, 'bin');
  if (existsSync(path.join(binDir, 'node'))) {
    return { binDir, note: `using cached Node ${pinned}` };
  }

  try {
    mkdirSync(cacheRoot, { recursive: true });
    const archivePath = path.join(cacheRoot, archive.fileName);
    curl(`${NODE_DIST_URL}/v${pinned}/${archive.fileName}`, archivePath);
    const sumsPath = path.join(cacheRoot, `SHASUMS256-${pinned}.txt`);
    curl(`${NODE_DIST_URL}/v${pinned}/SHASUMS256.txt`, sumsPath);

    const expected = parseChecksum(
      readFileSync(sumsPath, 'utf8'),
      archive.fileName,
    );
    const actual = createHash('sha256')
      .update(readFileSync(archivePath))
      .digest('hex');
    if (!expected || expected !== actual) {
      rmSync(archivePath, { force: true });
      throw new Error(`Checksum mismatch for ${archive.fileName}`);
    }

    const extracted = spawnSync(
      'tar',
      [archive.tarFlags, archivePath, '-C', cacheRoot],
      {
        stdio: 'inherit',
      },
    );
    rmSync(archivePath, { force: true });
    if (extracted.status !== 0)
      throw new Error('Could not extract the Node archive');
    return { binDir, note: `downloaded Node ${pinned} to ${cacheRoot}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      binDir: null,
      note: `could not provision Node ${pinned} (${message}); using host Node ${hostNode ?? 'unknown'}, so runtime-acceptance contracts may fail here`,
    };
  }
}
