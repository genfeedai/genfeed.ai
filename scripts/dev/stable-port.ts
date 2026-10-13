import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';

/** The range Portless auto-assigns from, so a pinned port looks like any other. */
export const STABLE_PORT_RANGE_START = 4000;
export const STABLE_PORT_RANGE_SIZE = 1000;
export const STABLE_PORT_PROBE_LIMIT = 16;

type PortProbe = (port: number) => Promise<boolean>;

/**
 * The same seed always lands on the same port, so a restart keeps the number a
 * log, a bookmark or a debugger was already pointing at.
 */
export function hashToPort(seed: string, offset = 0): number {
  const digest = createHash('sha256').update(seed).digest();
  return (
    STABLE_PORT_RANGE_START +
    ((digest.readUInt32BE(0) + offset) % STABLE_PORT_RANGE_SIZE)
  );
}

/**
 * Ports are owned per worktree and service: two worktrees, or two services in
 * one, hash to different seeds and almost always to different ports.
 */
export function stablePortSeed(service: string, workspace: string): string {
  return `${service}|${workspace}`;
}

export function readWorkspaceName(
  readBranch: () => string = () =>
    execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  fallback: string = process.cwd(),
): string {
  try {
    const branch = readBranch().trim();
    return branch && branch !== 'HEAD' ? branch : fallback;
  } catch {
    return fallback;
  }
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/**
 * First free port from the seed's probe sequence. Returns `undefined` when
 * every probe is taken, and the caller then lets Portless pick one instead of
 * failing to start.
 */
export async function resolveStablePort(
  seed: string,
  isFree: PortProbe = isPortFree,
): Promise<number | undefined> {
  for (let attempt = 0; attempt < STABLE_PORT_PROBE_LIMIT; attempt += 1) {
    const port = hashToPort(seed, attempt);
    if (await isFree(port)) {
      return port;
    }
  }
  return undefined;
}

export function portlessAppPortArgs(port: number | undefined): string[] {
  return port === undefined ? [] : ['--app-port', String(port)];
}
