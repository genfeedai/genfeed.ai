import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  chown,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = [
  ['/usr/bin/ffmpeg', ['-version'], 'ffmpeg'],
  ['/usr/bin/ffprobe', ['-version'], 'ffmpeg'],
  ['/usr/bin/zstd', ['--version'], 'zstd'],
];
const APT = '/usr/bin/apt-get';

export function parseManifest(text) {
  const names = new Set();
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      if (
        [...line].some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
      )
        throw new Error('Control character in APT archive manifest');
      const match =
        /^'([^'\s]+)' ([A-Za-z0-9][A-Za-z0-9+_.%~:-]*\.deb) ([1-9][0-9]*) SHA256:([a-fA-F0-9]{64})$/.exec(
          line,
        );
      if (!match) throw new Error('Invalid APT archive manifest');
      const [, uri, name, bytes, digest] = match;
      const scheme = uri.slice(0, uri.indexOf(':'));
      if (
        ![
          'http',
          'https',
          'mirror+http',
          'mirror+https',
          'mirror+file',
        ].includes(scheme) ||
        !Number.isSafeInteger(Number(bytes)) ||
        names.has(name) ||
        name.includes('..')
      )
        throw new Error('Unsafe APT archive manifest');
      // APT keeps authority over native mirror resolution; never rewrite its URI.
      if (scheme === 'mirror+file') {
        if (
          !uri.startsWith('mirror+file:/') ||
          uri.startsWith('mirror+file://')
        )
          throw new Error('Invalid APT mirror URI');
      } else {
        const url = new URL(uri.replace(/^mirror\+/, ''));
        if (!url.hostname) throw new Error('Invalid APT archive URI');
      }
      names.add(name);
      return { uri, name, size: Number(bytes), digest: digest.toLowerCase() };
    });
}

export class ProcessSupervisor {
  constructor(signal) {
    this.children = new Set();
    this.reason = undefined;
    this.signal = signal;
    this.onAbort = () =>
      this.stop(signal.reason ?? new Error('Installer cancelled'));
    signal?.addEventListener('abort', this.onAbort, { once: true });
    if (signal?.aborted) this.onAbort();
  }

  stop(reason) {
    this.reason ??= reason;
    for (const record of this.children) {
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        try {
          process.kill(-record.child.pid, signal);
        } catch (error) {
          if (error.code !== 'ESRCH') record.killError = error;
        }
      }
    }
  }

  async run(command, args) {
    if (this.reason) throw this.reason;
    const child = spawn(command, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const record = { child };
    const completion = new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let spawnError;
      child.stdout.on('data', (data) => {
        stdout += data;
      });
      child.stderr.on('data', (data) => {
        stderr += data;
      });
      child.once('error', (error) => {
        spawnError = error;
      });
      child.once('close', (code, signal) => {
        this.children.delete(record);
        if (record.killError) reject(record.killError);
        else if (spawnError) reject(spawnError);
        else resolve({ code, signal, stdout, stderr });
      });
    });
    record.completion = completion;
    this.children.add(record);
    return completion;
  }

  async checked(command, args) {
    const result = await this.run(command, args);
    if (this.reason) throw this.reason;
    if (result.code !== 0)
      throw new Error(
        `${command} failed (${result.code ?? result.signal}): ${result.stderr.trim()}`,
      );
    return result.stdout;
  }

  async close() {
    await Promise.allSettled(
      [...this.children].map((record) => record.completion),
    );
    this.signal?.removeEventListener('abort', this.onAbort);
  }
}

export async function prefetchArchives(entries, download, cancel, signal) {
  let index = 0;
  let failure;
  await Promise.all(
    Array.from({ length: Math.min(4, entries.length) }, async () => {
      while (!failure && !signal?.aborted && index < entries.length) {
        const entry = entries[index++];
        try {
          await download(entry);
        } catch (error) {
          failure ??= error;
          cancel(error);
        }
      }
    }),
  );
  if (failure) throw failure;
  if (signal?.aborted) throw signal.reason;
}

export async function verifyArchive(filename, entry) {
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== entry.size)
      throw new Error('APT archive size or file type mismatch');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false }))
      hash.update(chunk);
    if (hash.digest('hex') !== entry.digest)
      throw new Error('APT archive SHA256 mismatch');
  } finally {
    await handle.close();
  }
}

export async function prepareStage(
  uid,
  files = { mkdtemp, chmod, mkdir, chown, rm },
) {
  const base = await files.mkdtemp('/tmp/genfeed-visual-runtime-');
  try {
    await files.chmod(base, 0o755);
    const cache = path.join(base, 'archives');
    const partial = path.join(cache, 'partial');
    await files.mkdir(cache, { mode: 0o755 });
    await files.chmod(cache, 0o755);
    await files.mkdir(partial, { mode: 0o700 });
    await files.chown(partial, uid, 0);
    return { base, cache, partial, sandboxUid: uid };
  } catch (error) {
    await files.rm(base, { recursive: true, force: true });
    throw error;
  }
}

export async function prepareAcquisition(
  stage,
  files = { mkdtemp, chmod, mkdir, chown },
) {
  if (!Number.isSafeInteger(stage.sandboxUid) || stage.sandboxUid <= 0)
    throw new Error('Missing verified APT sandbox identity');
  const lists = await files.mkdtemp(path.join(stage.base, 'apt-lists-'));
  await files.chmod(lists, 0o755);
  const auxiliary = path.join(lists, 'auxfiles');
  await files.mkdir(auxiliary, { mode: 0o755 });
  await files.chmod(auxiliary, 0o755);
  await files.chown(auxiliary, stage.sandboxUid, 0);
  return lists;
}

export function systemOperations(supervisor, { acquisitionFiles } = {}) {
  return {
    probe: async (command, args) => {
      try {
        return (await supervisor.run(command, args)).code === 0;
      } catch (error) {
        if (supervisor.reason) throw supervisor.reason;
        if (['ENOENT', 'EACCES', 'ENOEXEC'].includes(error.code)) return false;
        throw error;
      }
    },
    update: () => supervisor.checked(APT, ['update']),
    prepare: async () => {
      const passwd = await supervisor.checked('/usr/bin/getent', [
        'passwd',
        '_apt',
      ]);
      const fields = passwd.trim().split(':');
      const uid = Number(fields[2]);
      if (fields[0] !== '_apt' || !Number.isSafeInteger(uid) || uid <= 0)
        throw new Error('Missing native APT sandbox user');
      return prepareStage(uid);
    },
    manifest: (stage, packages) =>
      supervisor.checked(APT, [
        '-qq',
        '-o',
        'Acquire::ForceHash=SHA256',
        '-o',
        `Dir::Cache::archives=${stage.cache}/`,
        '--print-uris',
        '--no-install-recommends',
        '--reinstall',
        '-y',
        'install',
        ...packages,
      ]),
    download: async (stage, entry) => {
      const lists = await prepareAcquisition(stage, acquisitionFiles);
      return supervisor.checked('/usr/lib/apt/apt-helper', [
        '-o',
        'Acquire::Retries=0',
        '-o',
        `Dir::State::lists=${lists}/`,
        'download-file',
        entry.uri,
        path.join(stage.partial, entry.name),
        `SHA256:${entry.digest}`,
      ]);
    },
    promote: async (stage, entries) => {
      // Freeze the sandbox-writable directory only after every downloader closes.
      await chown(stage.partial, 0, 0);
      await chmod(stage.partial, 0o700);
      const expected = new Set(entries.map((entry) => entry.name));
      const actual = await readdir(stage.partial);
      if (
        actual.length !== expected.size ||
        actual.some((name) => !expected.has(name))
      )
        throw new Error('Unexpected APT archive files');
      for (const entry of entries) {
        const source = path.join(stage.partial, entry.name);
        const stat = await lstat(source);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
          throw new Error('Unsafe APT archive file');
        const handle = await open(
          source,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          await handle.chown(0, 0);
          await handle.chmod(0o644);
        } finally {
          await handle.close();
        }
        await rename(source, path.join(stage.cache, entry.name));
      }
    },
    verify: async (stage, entries) => {
      const cache = await lstat(stage.cache);
      if (!cache.isDirectory() || cache.uid !== 0 || (cache.mode & 0o022) !== 0)
        throw new Error('Unsafe final APT cache');
      const expected = new Set([
        'partial',
        ...entries.map((entry) => entry.name),
      ]);
      const actual = await readdir(stage.cache);
      if (
        actual.length !== expected.size ||
        actual.some((name) => !expected.has(name))
      )
        throw new Error('Unexpected final APT cache files');
      for (const entry of entries) {
        const filename = path.join(stage.cache, entry.name);
        const stat = await lstat(filename);
        if (stat.uid !== 0 || (stat.mode & 0o022) !== 0)
          throw new Error('Unsafe final APT archive ownership');
        await verifyArchive(filename, entry);
      }
    },
    install: (stage, packages) =>
      supervisor.checked(APT, [
        '-o',
        `Dir::Cache::archives=${stage.cache}/`,
        '--no-download',
        '--no-install-recommends',
        '--reinstall',
        '-y',
        'install',
        ...packages,
      ]),
    cleanup: (stage) => rm(stage.base, { recursive: true, force: true }),
  };
}

export async function installDependencies(
  operations,
  { signal, supervisor } = {},
) {
  let stage;
  const check = () => {
    if (signal?.aborted) throw signal.reason;
  };
  const probe = async () => {
    const missing = new Set();
    for (const [command, args, pkg] of TOOLS) {
      check();
      if (!(await operations.probe(command, args))) missing.add(pkg);
    }
    check();
    return [...missing];
  };
  try {
    const packages = await probe();
    if (packages.length === 0) return;
    await operations.update();
    check();
    stage = await operations.prepare();
    check();
    const entries = parseManifest(await operations.manifest(stage, packages));
    check();
    await prefetchArchives(
      entries,
      (entry) => operations.download(stage, entry),
      (error) => supervisor?.stop(error),
      signal,
    );
    check();
    await operations.promote(stage, entries);
    check();
    await operations.verify(stage, entries);
    check();
    await operations.install(stage, packages);
    if ((await probe()).length > 0)
      throw new Error('Real visual runtime tools remain unavailable');
  } catch (error) {
    supervisor?.stop(error);
    throw error;
  } finally {
    await supervisor?.close();
    if (stage) await operations.cleanup(stage);
  }
}

export async function withCancellation(operation) {
  const controller = new AbortController();
  const cancel = () =>
    controller.abort(
      new Error('Visual runtime dependency preparation cancelled'),
    );
  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);
  try {
    return await operation(controller.signal);
  } finally {
    process.removeListener('SIGTERM', cancel);
    process.removeListener('SIGINT', cancel);
  }
}

export async function main() {
  if (process.platform !== 'linux' || process.getuid?.() !== 0)
    throw new Error(
      'Visual runtime dependency preparation requires Linux root',
    );
  if (process.argv.length !== 2)
    throw new Error('No installer arguments are supported');
  await withCancellation(async (signal) => {
    const supervisor = new ProcessSupervisor(signal);
    await installDependencies(systemOperations(supervisor), {
      signal,
      supervisor,
    });
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
