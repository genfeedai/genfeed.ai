import { describe, expect, it, vi } from 'vitest';
import {
  hashToPort,
  portlessAppPortArgs,
  readWorkspaceName,
  resolveStablePort,
  STABLE_PORT_PROBE_LIMIT,
  STABLE_PORT_RANGE_SIZE,
  STABLE_PORT_RANGE_START,
  stablePortSeed,
} from './stable-port';

describe('hashToPort', () => {
  it('returns the same port for the same seed every time', () => {
    expect(hashToPort('api|feat/a')).toBe(hashToPort('api|feat/a'));
  });

  it('stays inside the range Portless assigns from', () => {
    for (const seed of ['api|a', 'app|a', 'files|feat/long-branch-name', '']) {
      for (let offset = 0; offset < 40; offset += 1) {
        const port = hashToPort(seed, offset);
        expect(port).toBeGreaterThanOrEqual(STABLE_PORT_RANGE_START);
        expect(port).toBeLessThan(
          STABLE_PORT_RANGE_START + STABLE_PORT_RANGE_SIZE,
        );
      }
    }
  });

  it('gives each service in one worktree its own port', () => {
    const services = ['app', 'api', 'files', 'notifications', 'mcp', 'docs'];
    const ports = services.map((service) =>
      hashToPort(stablePortSeed(service, 'feat/a')),
    );

    expect(new Set(ports).size).toBe(services.length);
  });

  it('gives different worktrees different ports for the same service', () => {
    expect(hashToPort(stablePortSeed('api', 'feat/a'))).not.toBe(
      hashToPort(stablePortSeed('api', 'feat/b')),
    );
  });
});

describe('resolveStablePort', () => {
  it('uses the seed port when it is free', async () => {
    const isFree = vi.fn(async () => true);

    await expect(resolveStablePort('api|a', isFree)).resolves.toBe(
      hashToPort('api|a'),
    );
    expect(isFree).toHaveBeenCalledTimes(1);
  });

  it('probes the next port in the sequence when one is taken', async () => {
    const taken = new Set([hashToPort('api|a', 0), hashToPort('api|a', 1)]);

    await expect(
      resolveStablePort('api|a', async (port) => !taken.has(port)),
    ).resolves.toBe(hashToPort('api|a', 2));
  });

  it('lands on the same port after a restart when nothing else moved', async () => {
    const free = async () => true;

    expect(await resolveStablePort('api|a', free)).toBe(
      await resolveStablePort('api|a', free),
    );
  });

  it('gives up so Portless can pick a port when every probe is taken', async () => {
    const isFree = vi.fn(async () => false);

    await expect(resolveStablePort('api|a', isFree)).resolves.toBeUndefined();
    expect(isFree).toHaveBeenCalledTimes(STABLE_PORT_PROBE_LIMIT);
  });
});

describe('readWorkspaceName', () => {
  it('uses the branch name', () => {
    expect(readWorkspaceName(() => 'feat/a\n')).toBe('feat/a');
  });

  it('falls back when git is unavailable or the head is detached', () => {
    expect(
      readWorkspaceName(() => {
        throw new Error('no git');
      }, '/work/tree'),
    ).toBe('/work/tree');
    expect(readWorkspaceName(() => 'HEAD', '/work/tree')).toBe('/work/tree');
    expect(readWorkspaceName(() => '  ', '/work/tree')).toBe('/work/tree');
  });
});

describe('portlessAppPortArgs', () => {
  it('pins the app port, or leaves Portless to choose', () => {
    expect(portlessAppPortArgs(4321)).toEqual(['--app-port', '4321']);
    expect(portlessAppPortArgs(undefined)).toEqual([]);
  });
});
