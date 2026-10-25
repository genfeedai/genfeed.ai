import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, readdir, rmdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const EXIT_CODES = { SIGINT: 130, SIGHUP: 129, SIGTERM: 143 } as const;
type InterruptSignal = keyof typeof EXIT_CODES;

export class InstallationInterruptedError extends Error {
  readonly exitCode: number;

  constructor(signal: InterruptSignal) {
    super(`Installation cancelled (${signal}).`);
    this.exitCode = EXIT_CODES[signal];
  }
}

export function createCancellation() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    abort: (reason: unknown) => controller.abort(reason),
    interrupt: (signal: InterruptSignal) =>
      controller.abort(new InstallationInterruptedError(signal)),
  };
}

export type InstallationLifecycle = ReturnType<typeof createCancellation>;

export async function withInstallationLifecycle(
  operation: (lifecycle: InstallationLifecycle) => Promise<void>,
): Promise<void> {
  const lifecycle = createCancellation();
  const handlers = {
    SIGINT: () => lifecycle.interrupt('SIGINT'),
    SIGHUP: () => lifecycle.interrupt('SIGHUP'),
    SIGTERM: () => lifecycle.interrupt('SIGTERM'),
  };
  for (const [signal, handler] of Object.entries(handlers))
    process.on(signal, handler);
  try {
    await operation(lifecycle);
    lifecycle.signal.throwIfAborted();
  } catch (error) {
    throw lifecycle.signal.aborted ? lifecycle.signal.reason : error;
  } finally {
    for (const [signal, handler] of Object.entries(handlers))
      process.off(signal, handler);
  }
}

type OwnedEntry = { metadata: Stats; hash: string | null };
const hash = (content: Uint8Array) =>
  createHash('sha256').update(content).digest('hex');

function sameIdentity(current: Stats, expected: Stats): boolean {
  return (
    current.dev === expected.dev &&
    current.ino === expected.ino &&
    current.mode === expected.mode
  );
}

export async function createOwnedInstallation(directory: string) {
  await mkdir(directory);
  const entries = new Map<string, OwnedEntry>([
    ['', { metadata: await lstat(directory), hash: null }],
  ]);

  async function matches(
    relative: string,
    entry: OwnedEntry,
  ): Promise<boolean> {
    const path = join(directory, relative);
    const current = await lstat(path);
    if (!sameIdentity(current, entry.metadata) || current.isSymbolicLink())
      return false;
    if (entry.hash === null) return current.isDirectory();
    if (
      !current.isFile() ||
      current.size !== entry.metadata.size ||
      current.mtimeMs !== entry.metadata.mtimeMs
    )
      return false;
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!sameIdentity(await file.stat(), entry.metadata)) return false;
      if (hash(await file.readFile()) !== entry.hash) return false;
      const after = await lstat(path);
      return (
        sameIdentity(after, entry.metadata) &&
        after.size === current.size &&
        after.mtimeMs === current.mtimeMs
      );
    } finally {
      await file.close();
    }
  }

  async function isUnchanged(): Promise<boolean> {
    try {
      const visit = async (relative: string): Promise<boolean> => {
        const entry = entries.get(relative);
        if (!entry || !(await matches(relative, entry))) return false;
        if (entry.hash !== null) return true;
        for (const name of await readdir(join(directory, relative))) {
          if (!(await visit(join(relative, name)))) return false;
        }
        return true;
      };
      if (!(await visit(''))) return false;
      for (const [relative, entry] of entries)
        if (!(await matches(relative, entry))) return false;
      return true;
    } catch {
      return false;
    }
  }

  async function writeOwnedFile(
    relative: string,
    content: Uint8Array,
    mode: number,
  ): Promise<void> {
    const file = await open(join(directory, relative), 'wx', mode);
    entries.set(relative, { metadata: await file.stat(), hash: hash(content) });
    try {
      await file.writeFile(content);
      entries.set(relative, {
        metadata: await file.stat(),
        hash: hash(content),
      });
    } finally {
      await file.close();
    }
  }

  return {
    async populate(source: string, signal: AbortSignal): Promise<void> {
      const visit = async (relative: string): Promise<void> => {
        for (const name of await readdir(join(source, relative))) {
          signal.throwIfAborted();
          const next = join(relative, name);
          const metadata = await lstat(join(source, next));
          if (metadata.isSymbolicLink())
            throw new Error('Release bundle contains a symbolic link.');
          if (metadata.isDirectory()) {
            await mkdir(join(directory, next), { mode: metadata.mode & 0o777 });
            entries.set(next, {
              metadata: await lstat(join(directory, next)),
              hash: null,
            });
            await visit(next);
          } else if (metadata.isFile()) {
            const file = await open(
              join(source, next),
              constants.O_RDONLY | constants.O_NOFOLLOW,
            );
            try {
              await writeOwnedFile(
                next,
                await file.readFile(),
                metadata.mode & 0o777,
              );
            } finally {
              await file.close();
            }
          } else
            throw new Error('Release bundle contains an unsupported file.');
        }
      };
      await visit('');
      signal.throwIfAborted();
    },
    async writeEnvironment(content: string): Promise<void> {
      if (!(await isUnchanged()))
        throw new Error('Installation files changed during setup.');
      await writeOwnedFile('.env', Buffer.from(content), 0o600);
    },
    async rollback(): Promise<boolean> {
      if (!(await isUnchanged())) return false;
      for (const [relative, entry] of [...entries].reverse()) {
        if (!(await matches(relative, entry))) return false;
        if (entry.hash === null) await rmdir(join(directory, relative));
        else await unlink(join(directory, relative));
      }
      return true;
    },
  };
}
