import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRelease, openBrowser } from '../src/index';

interface FakeChildOutcome {
  code?: number | null;
  error?: Error;
  signal?: NodeJS.Signals | null;
}

interface FakeChildProcess extends EventEmitter {
  unref: () => void;
}

const childProcessMock = vi.hoisted(() => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

const consolaMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  start: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('node:child_process', () => childProcessMock);
vi.mock('consola', () => ({ consola: consolaMock }));

const RELEASE_TAG = 'v0.5.0';
const APP_URL = 'http://localhost:3000';
const ARCHIVE_BODY = 'genfeed release archive fixture';
const ARCHIVE_CHECKSUM = createHash('sha256')
  .update(ARCHIVE_BODY)
  .digest('hex');
const RELEASE_MANIFEST_CONTENT = JSON.stringify({
  image: 'ghcr.io/genfeedai/genfeed.ai:0.5.0',
  releaseTag: RELEASE_TAG,
  schemaVersion: 1,
});

const createdDirectories: string[] = [];

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createFakeChild(outcome: FakeChildOutcome = {}): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;
  child.unref = () => {
    // Detached children are fire-and-forget in these tests.
  };
  setImmediate(() => {
    if (outcome.error) {
      child.emit('error', outcome.error);
      return;
    }
    child.emit(
      'close',
      outcome.code === undefined ? 0 : outcome.code,
      outcome.signal ?? null,
    );
  });
  return child;
}

function extractTarFixture(args: readonly string[]): void {
  const target = args[args.indexOf('-C') + 1];
  writeFileSync(join(target, 'release.json'), RELEASE_MANIFEST_CONTENT);
  writeFileSync(join(target, '.env.example'), 'GENFEED_SEED=1\n');
}

function useDefaultSpawnBehavior(): void {
  childProcessMock.spawn.mockImplementation(
    (command: string, args: readonly string[]) => {
      if (command === 'tar') {
        extractTarFixture(args);
      }
      return createFakeChild();
    },
  );
}

function createFetchStub(
  onAppRequest: (url: string) => Response,
): typeof fetch {
  const stub = async (input: string | URL | Request): Promise<Response> => {
    const url = input.toString();
    if (url.endsWith('genfeed-selfhosted.tar.gz')) {
      return new Response(ARCHIVE_BODY, { status: 200 });
    }
    if (url.endsWith('genfeed-selfhosted.tar.gz.sha256')) {
      return new Response(`${ARCHIVE_CHECKSUM}  genfeed-selfhosted.tar.gz\n`, {
        status: 200,
      });
    }
    return onAppRequest(url);
  };
  return stub as typeof fetch;
}

const unreachableFetch = createFetchStub((url) => {
  throw new Error(`Unexpected fetch call: ${url}`);
});

beforeEach(() => {
  childProcessMock.spawnSync.mockReturnValue({ status: 0 });
  useDefaultSpawnBehavior();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      await rm(directory, { force: true, recursive: true });
    }
  }
});

describe('installRelease', () => {
  it('installs a pinned release without starting it', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');

    await expect(
      installRelease(
        projectDirectory,
        { release: RELEASE_TAG, start: false },
        unreachableFetch,
      ),
    ).resolves.toBeUndefined();

    await expect(
      readFile(join(projectDirectory, '.env'), 'utf8'),
    ).resolves.toBe('GENFEED_SEED=1\n');
    expect(childProcessMock.spawn).toHaveBeenCalledWith(
      'tar',
      expect.arrayContaining(['-xzf']),
      expect.objectContaining({ stdio: 'ignore' }),
    );
    expect(childProcessMock.spawn).toHaveBeenCalledWith(
      'docker',
      [
        'compose',
        '--env-file',
        '.env',
        '-f',
        'compose.yml',
        'config',
        '--quiet',
      ],
      expect.objectContaining({ cwd: projectDirectory }),
    );
    expect(consolaMock.success).toHaveBeenCalledWith(
      expect.stringContaining(`Installed ${RELEASE_TAG}`),
    );
    expect(consolaMock.info).toHaveBeenCalledWith(
      expect.stringContaining('Start later with'),
    );
  });

  it('starts the stack and opens the browser once the app responds', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    const fetchImplementation = createFetchStub(
      () => new Response('ready', { status: 200 }),
    );

    await installRelease(
      projectDirectory,
      { release: RELEASE_TAG, start: true },
      fetchImplementation,
    );

    expect(childProcessMock.spawn).toHaveBeenCalledWith(
      'docker',
      ['compose', '--env-file', '.env', '-f', 'compose.yml', 'up', '-d'],
      expect.objectContaining({ cwd: projectDirectory }),
    );
    expect(consolaMock.success).toHaveBeenCalledWith(
      `Genfeed.ai is running at ${APP_URL}`,
    );
  });

  it('treats a redirect from the app as ready', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    const fetchImplementation = createFetchStub(
      () =>
        new Response(null, { headers: { location: '/login' }, status: 302 }),
    );

    await installRelease(
      projectDirectory,
      { release: RELEASE_TAG, start: true },
      fetchImplementation,
    );

    expect(consolaMock.success).toHaveBeenCalledWith(
      `Genfeed.ai is running at ${APP_URL}`,
    );
  });

  it('warns when the containers start but the app never becomes ready', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    let simulatedNow = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      simulatedNow += 100_000;
      return simulatedNow;
    });
    const fetchImplementation = createFetchStub(() => {
      throw new Error('connection refused');
    });

    await installRelease(
      projectDirectory,
      { release: RELEASE_TAG, start: true },
      fetchImplementation,
    );

    expect(consolaMock.warn).toHaveBeenCalledWith(
      `The containers started, but ${APP_URL} is not ready yet.`,
    );
    expect(existsSync(projectDirectory)).toBe(true);
  });

  it('requires tar to be installed', async () => {
    childProcessMock.spawnSync.mockReturnValue({ status: 1 });

    await expect(
      installRelease('ignored', { release: RELEASE_TAG, start: false }),
    ).rejects.toThrow(
      'tar is required to extract the Genfeed.ai release bundle.',
    );
  });

  it('requires Docker Compose to be installed', async () => {
    childProcessMock.spawnSync.mockImplementation((command: string) => ({
      status: command === 'tar' ? 0 : 1,
    }));

    await expect(
      installRelease('ignored', { release: RELEASE_TAG, start: false }),
    ).rejects.toThrow('Docker Compose is required.');
  });

  it('refuses to install into an existing destination', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    await mkdir(projectDirectory);

    await expect(
      installRelease(
        projectDirectory,
        { release: RELEASE_TAG, start: false },
        unreachableFetch,
      ),
    ).rejects.toThrow(`Destination already exists: ${projectDirectory}`);
  });

  it('fails when a release asset download errors', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    const fetchImplementation = ((): typeof fetch => {
      const stub = async (): Promise<Response> =>
        new Response('missing', { status: 404 });
      return stub as typeof fetch;
    })();

    await expect(
      installRelease(
        projectDirectory,
        { release: RELEASE_TAG, start: false },
        fetchImplementation,
      ),
    ).rejects.toThrow('Download failed (HTTP 404)');
    expect(existsSync(projectDirectory)).toBe(false);
  });

  it('fails on a checksum mismatch before creating the project', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    const stub = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.endsWith('.sha256')) {
        return new Response(`${'a'.repeat(64)}  genfeed-selfhosted.tar.gz\n`, {
          status: 200,
        });
      }
      return new Response(ARCHIVE_BODY, { status: 200 });
    };

    await expect(
      installRelease(
        projectDirectory,
        { release: RELEASE_TAG, start: false },
        stub as typeof fetch,
      ),
    ).rejects.toThrow('Release checksum mismatch');
    expect(existsSync(projectDirectory)).toBe(false);
  });

  it('removes the project directory when extraction fails', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    childProcessMock.spawn.mockImplementation((command: string) =>
      command === 'tar' ? createFakeChild({ code: 2 }) : createFakeChild(),
    );

    await expect(
      installRelease(
        projectDirectory,
        { release: RELEASE_TAG, start: false },
        unreachableFetch,
      ),
    ).rejects.toThrow('failed with 2');
    expect(existsSync(projectDirectory)).toBe(false);
  });

  it('reports the terminating signal when a command is killed', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    childProcessMock.spawn.mockImplementation((command: string) =>
      command === 'tar'
        ? createFakeChild({ code: null, signal: 'SIGKILL' })
        : createFakeChild(),
    );

    await expect(
      installRelease(
        projectDirectory,
        { release: RELEASE_TAG, start: false },
        unreachableFetch,
      ),
    ).rejects.toThrow('failed with SIGKILL');
  });

  it('reports an unknown error when a command exits without code or signal', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    childProcessMock.spawn.mockImplementation((command: string) =>
      command === 'tar'
        ? createFakeChild({ code: null, signal: null })
        : createFakeChild(),
    );

    await expect(
      installRelease(
        projectDirectory,
        { release: RELEASE_TAG, start: false },
        unreachableFetch,
      ),
    ).rejects.toThrow('failed with an unknown error');
  });

  it('rejects when a command cannot be spawned', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    childProcessMock.spawn.mockImplementation((command: string) =>
      command === 'tar'
        ? createFakeChild({ error: new Error('spawn tar ENOENT') })
        : createFakeChild(),
    );

    await expect(
      installRelease(
        projectDirectory,
        { release: RELEASE_TAG, start: false },
        unreachableFetch,
      ),
    ).rejects.toThrow('spawn tar ENOENT');
  });

  it('preserves installation files when startup fails', async () => {
    const base = await createTemporaryDirectory('genfeed-install-');
    const projectDirectory = join(base, 'app');
    childProcessMock.spawn.mockImplementation(
      (command: string, args: readonly string[]) => {
        if (command === 'tar') {
          extractTarFixture(args);
          return createFakeChild();
        }
        if (command === 'docker' && args.includes('up')) {
          return createFakeChild({ code: 1 });
        }
        return createFakeChild();
      },
    );

    await expect(
      installRelease(
        projectDirectory,
        { release: RELEASE_TAG, start: true },
        unreachableFetch,
      ),
    ).rejects.toThrow('failed with 1');
    expect(consolaMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('Startup failed.'),
    );
    expect(existsSync(join(projectDirectory, '.env'))).toBe(true);
  });
});

describe('openBrowser', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  function setPlatform(platform: string): void {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: platform,
    });
  }

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('uses open on macOS and survives spawn errors', async () => {
    setPlatform('darwin');
    childProcessMock.spawn.mockImplementation(() =>
      createFakeChild({ error: new Error('open failed') }),
    );

    openBrowser(APP_URL);
    await new Promise((resolvePromise) => setImmediate(resolvePromise));

    expect(childProcessMock.spawn).toHaveBeenCalledWith(
      'open',
      [APP_URL],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });

  it('uses xdg-open on Linux', () => {
    setPlatform('linux');

    openBrowser(APP_URL);

    expect(childProcessMock.spawn).toHaveBeenCalledWith(
      'xdg-open',
      [APP_URL],
      expect.objectContaining({ detached: true }),
    );
  });

  it('uses cmd start on Windows', () => {
    setPlatform('win32');

    openBrowser(APP_URL);

    expect(childProcessMock.spawn).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'start', '', APP_URL],
      expect.objectContaining({ detached: true }),
    );
  });

  it('does nothing on unsupported platforms', () => {
    setPlatform('freebsd');

    openBrowser(APP_URL);

    expect(childProcessMock.spawn).not.toHaveBeenCalled();
  });
});
