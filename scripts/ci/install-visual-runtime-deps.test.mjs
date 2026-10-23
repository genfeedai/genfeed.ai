import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { constants, readFileSync } from 'node:fs';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  installDependencies,
  ProcessSupervisor,
  parseManifest,
  prefetchArchives,
  prepareAcquisition,
  prepareStage,
  systemOperations,
  verifyArchive,
} from './install-visual-runtime-deps.mjs';

const digest = createHash('sha256').update('fixture').digest('hex');
const archive = (
  name = 'ffmpeg_1_amd64.deb',
  uri = 'mirror+file:/etc/apt/apt-mirrors.txt/pool/ffmpeg.deb',
) => `'${uri}' ${name} 7 SHA256:${digest}`;
const stage = {
  sandboxUid: 42,
  base: '/tmp/fixture',
  cache: '/tmp/fixture/archives',
  partial: '/tmp/fixture/archives/partial',
};

function fixture({
  broken = ['/usr/bin/ffmpeg'],
  manifest = archive(),
  fail,
  signal,
} = {}) {
  const events = [];
  let installed = false;
  let active = 0;
  const ops = {
    probe: async (command, args) => {
      events.push(['probe', command, args, installed]);
      return installed || !broken.includes(command);
    },
    update: async () => {
      events.push(['update']);
      if (fail === 'update') throw new Error(fail);
    },
    prepare: async () => {
      events.push(['prepare']);
      if (fail === 'prepare') throw new Error(fail);
      return stage;
    },
    manifest: async (_stage, packages) => {
      events.push(['manifest', packages]);
      return manifest;
    },
    download: async (_stage, entry) => {
      active++;
      events.push(['download', entry.uri]);
      try {
        await new Promise((resolve) => setImmediate(resolve));
        if (fail === 'download') throw new Error(fail);
        if (signal) signal.abort(new Error('fixture cancellation'));
      } finally {
        active--;
      }
    },
    promote: async () => {
      assert.equal(active, 0);
      events.push(['promote']);
    },
    verify: async () => {
      events.push(['verify']);
      if (fail === 'verify') throw new Error('integrity');
    },
    install: async (_stage, packages) => {
      events.push(['install', packages]);
      if (fail === 'install') throw new Error('authentication rejected');
      installed = true;
    },
    cleanup: async () => {
      assert.equal(active, 0);
      events.push(['cleanup']);
    },
  };
  return { ops, events };
}

test('all visual installers use bounded native dependency preparation', () => {
  const workflow = readFileSync(
    new URL(
      '../../.github/workflows/visual-code-isolation.yml',
      import.meta.url,
    ),
    'utf8',
  );
  assert.equal(
    (
      workflow.match(
        /sudo "\$\(command -v node\)" "\$GITHUB_WORKSPACE\/scripts\/ci\/install-visual-runtime-deps\.mjs"/g,
      ) ?? []
    ).length,
    3,
  );
  assert.doesNotMatch(workflow, /sudo apt-get (update|install)/);
  for (const file of [
    'install-visual-runtime-deps.mjs',
    'install-visual-runtime-deps.test.mjs',
  ])
    assert.ok(workflow.includes(`- 'scripts/ci/${file}'`));
  assert.equal(
    (workflow.match(/sha512sum -c gvisor\.tar\.zstd\.sha512/g) ?? []).length,
    3,
  );
  assert.ok(workflow.includes('300000 + RUNTIME_ACCEPTANCE_JOB_STARTED_MS'));
  assert.ok(workflow.includes('720000 + RUNTIME_ACCEPTANCE_JOB_STARTED_MS'));
  assert.ok(workflow.includes('FFMPEG_BIN=/usr/bin/ffmpeg'));
});

test('healthy real tools cause no APT, network or temporary work', async () => {
  const { ops, events } = fixture({ broken: [] });
  await installDependencies(ops);
  assert.deepEqual(
    events.map(([event]) => event),
    ['probe', 'probe', 'probe'],
  );
  assert.deepEqual(
    events.map(([, command]) => command),
    ['/usr/bin/ffmpeg', '/usr/bin/ffprobe', '/usr/bin/zstd'],
  );
});

for (const [broken, packages] of [
  [['/usr/bin/ffmpeg'], ['ffmpeg']],
  [['/usr/bin/ffprobe'], ['ffmpeg']],
  [['/usr/bin/zstd'], ['zstd']],
  [
    ['/usr/bin/ffmpeg', '/usr/bin/ffprobe', '/usr/bin/zstd'],
    ['ffmpeg', 'zstd'],
  ],
])
  test(`missing ${broken.join(',')} selects only required package`, async () => {
    const { ops, events } = fixture({ broken });
    await installDependencies(ops);
    assert.deepEqual(
      events.find(([event]) => event === 'manifest')[1],
      packages,
    );
    assert.deepEqual(
      events.find(([event]) => event === 'install')[1],
      packages,
    );
    assert.equal(events.filter(([event]) => event === 'probe').length, 6);
    assert.deepEqual(
      events.slice(-4).map(([event]) => event),
      ['probe', 'probe', 'probe', 'cleanup'],
    );
    assert.deepEqual(
      events
        .filter(([event]) => event === 'probe')
        .slice(3)
        .map(([, command]) => command),
      ['/usr/bin/ffmpeg', '/usr/bin/ffprobe', '/usr/bin/zstd'],
    );
  });

test('native mirror URI is preserved exactly with strict SHA256 manifest', () => {
  assert.deepEqual(parseManifest(archive()), [
    {
      uri: 'mirror+file:/etc/apt/apt-mirrors.txt/pool/ffmpeg.deb',
      name: 'ffmpeg_1_amd64.deb',
      size: 7,
      digest,
    },
  ]);
  for (const uri of [
    'http://archive.ubuntu.com/a.deb',
    'https://archive.ubuntu.com/a.deb',
    'mirror+http://archive.ubuntu.com/list/a.deb',
    'mirror+https://archive.ubuntu.com/list/a.deb',
  ])
    assert.equal(parseManifest(archive('package_1.deb', uri))[0].uri, uri);
  assert.deepEqual(parseManifest(''), []);
});

for (const [name, text] of [
  ['weak hash', archive().replace('SHA256:', 'MD5Sum:')],
  ['missing hash', archive().replace(/ SHA256:.*/, '')],
  ['short hash', archive().slice(0, -1)],
  ['zero bytes', archive().replace(' 7 ', ' 0 ')],
  ['unsafe integer', archive().replace(' 7 ', ' 9007199254740992 ')],
  ['negative bytes', archive().replace(' 7 ', ' -1 ')],
  ['path traversal', archive('../package.deb')],
  ['absolute path', archive('/package.deb')],
  ['leading flag', archive('-package.deb')],
  ['encoded newline in name', archive('package\n.deb')],
  ['duplicate destination', `${archive()}\n${archive()}`],
  [
    'conflicting destination',
    `${archive()}\n${archive().replace(' 7 ', ' 8 ')}`,
  ],
  ['unexpected record', `${archive()}\nReading package lists...`],
  ['file URI', archive('package.deb', 'file:/etc/passwd')],
  ['ftp URI', archive('package.deb', 'ftp://example.test/package.deb')],
  [
    'bad mirror URI',
    archive('package.deb', 'mirror+file:relative/package.deb'),
  ],
  [
    'URI option injection',
    archive('package.deb', 'https://example.test/a\n --option'),
  ],
])
  test(`rejects ${name} before download or install`, async () => {
    assert.throws(() => parseManifest(text));
    const { ops, events } = fixture({ manifest: text });
    await assert.rejects(installDependencies(ops));
    assert.ok(
      !events.some(([event]) => ['download', 'install'].includes(event)),
    );
    assert.equal(events.at(-1)[0], 'cleanup');
  });

test('prefetch permits four in-flight acquisitions and admits further work only after closure', async () => {
  const entries = Array.from({ length: 11 }, (_, id) => ({ id }));
  let active = 0;
  let peak = 0;
  const seen = [];
  await prefetchArchives(
    entries,
    async ({ id }) => {
      active++;
      peak = Math.max(peak, active);
      seen.push(id);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
    },
    () => assert.fail('unexpected cancellation'),
  );
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.equal(new Set(seen).size, 11);
});

test('prefetch stops admission at first failure and awaits all active acquisitions', async () => {
  let active = 0;
  const seen = [];
  let cancelled = 0;
  await assert.rejects(
    prefetchArchives(
      Array.from({ length: 12 }, (_, id) => ({ id })),
      async ({ id }) => {
        active++;
        seen.push(id);
        try {
          if (id === 0) throw new Error('download rejected');
          await new Promise((resolve) => setImmediate(resolve));
        } finally {
          active--;
        }
      },
      () => {
        cancelled++;
      },
    ),
    /download rejected/,
  );
  assert.equal(active, 0);
  assert.ok(seen.length <= 4);
  assert.equal(cancelled, 1);
});

test('stage is traversable by _apt with only its partial directory writable', async () => {
  const events = [];
  const files = {
    mkdtemp: async (prefix) => {
      events.push(['mkdtemp', prefix]);
      return '/tmp/fresh-root-cache';
    },
    chmod: async (...args) => events.push(['chmod', ...args]),
    mkdir: async (...args) => events.push(['mkdir', ...args]),
    chown: async (...args) => events.push(['chown', ...args]),
    rm: async () => assert.fail('successful preparation must not clean early'),
  };
  const prepared = await prepareStage(42, files);
  assert.deepEqual(events, [
    ['mkdtemp', '/tmp/genfeed-visual-runtime-'],
    ['chmod', '/tmp/fresh-root-cache', 0o755],
    ['mkdir', '/tmp/fresh-root-cache/archives', { mode: 0o755 }],
    ['chmod', '/tmp/fresh-root-cache/archives', 0o755],
    ['mkdir', '/tmp/fresh-root-cache/archives/partial', { mode: 0o700 }],
    ['chown', '/tmp/fresh-root-cache/archives/partial', 42, 0],
  ]);
  assert.equal(prepared.partial, '/tmp/fresh-root-cache/archives/partial');
});

test('failed sandbox preparation cleans its own new directory', async () => {
  const removed = [];
  await assert.rejects(
    prepareStage(42, {
      mkdtemp: async () => '/tmp/only-owned-fixture',
      chmod: async () => {
        throw new Error('permission rejected');
      },
      rm: async (...args) => removed.push(args),
    }),
    /permission rejected/,
  );
  assert.deepEqual(removed, [
    ['/tmp/only-owned-fixture', { recursive: true, force: true }],
  ]);
});

test('production argv retains APT trust, native mirrors, one try and fresh no-download cache', async () => {
  const calls = [];
  const ops = systemOperations(
    {
      checked: async (...args) => {
        calls.push(args);
        return '';
      },
    },
    {
      acquisitionFiles: {
        mkdtemp: async () => '/tmp/fixture/apt-lists-unique',
        chmod: async () => {},
        mkdir: async () => {},
        chown: async () => {},
      },
    },
  );
  const entry = parseManifest(archive())[0];
  await ops.update();
  await ops.manifest(stage, ['ffmpeg']);
  await ops.download(stage, entry);
  await ops.install(stage, ['ffmpeg']);
  const [, manifestArgs] = calls[1];
  assert.ok(manifestArgs.includes('Acquire::ForceHash=SHA256'));
  assert.ok(manifestArgs.includes('--no-install-recommends'));
  assert.ok(manifestArgs.includes('--reinstall'));
  assert.deepEqual(calls[2], [
    '/usr/lib/apt/apt-helper',
    [
      '-o',
      'Acquire::Retries=0',
      '-o',
      'Dir::State::lists=/tmp/fixture/apt-lists-unique/',
      'download-file',
      entry.uri,
      path.join(stage.partial, entry.name),
      `SHA256:${digest}`,
    ],
  ]);
  assert.ok(calls[3][1].includes('--no-download'));
  for (const index of [0, 1, 3])
    assert.ok(
      !calls[index][1].some((arg) => arg.startsWith('Dir::State::lists=')),
    );
  assert.ok(calls[3][1].includes(`Dir::Cache::archives=${stage.cache}/`));
  assert.ok(
    !calls
      .flat(2)
      .some((arg) =>
        /allow-unauthenticated|[Ii]nsecure|Sandbox|force-yes|ignore-missing/.test(
          arg,
        ),
      ),
  );
});

test('independent final verification rejects same-size corruption, truncation, symlink and nonregular files', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'visual-archive-test-'),
  );
  const filename = path.join(directory, 'package.deb');
  const entry = { size: 7, digest };
  try {
    await writeFile(filename, 'fixture');
    await verifyArchive(filename, entry);
    await writeFile(filename, 'corrupt');
    await assert.rejects(verifyArchive(filename, entry), /SHA256/);
    await writeFile(filename, 'short');
    await assert.rejects(verifyArchive(filename, entry), /size/);
    await symlink(filename, path.join(directory, 'link.deb'));
    await assert.rejects(
      verifyArchive(path.join(directory, 'link.deb'), entry),
    );
    await assert.rejects(verifyArchive(directory, entry));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  assert.ok(constants.O_NOFOLLOW);
});

for (const fail of ['update', 'prepare', 'download', 'verify', 'install'])
  test(`${fail} failure propagates and does not proceed past its stage`, async () => {
    const { ops, events } = fixture({ fail });
    await assert.rejects(installDependencies(ops));
    if (['download', 'verify'].includes(fail))
      assert.ok(!events.some(([event]) => event === 'install'));
    if (!['update', 'prepare'].includes(fail))
      assert.equal(events.at(-1)[0], 'cleanup');
  });

test('empty archive selection still uses final APT fail-closed authentication', async () => {
  const { ops, events } = fixture({ manifest: '', fail: 'install' });
  await assert.rejects(installDependencies(ops), /authentication rejected/);
  assert.ok(!events.some(([event]) => event === 'download'));
  assert.equal(events.at(-1)[0], 'cleanup');
});

test('post-install broken real tool is an error after cleanup', async () => {
  const { ops, events } = fixture();
  ops.probe = async () => false;
  await assert.rejects(installDependencies(ops), /remain unavailable/);
  assert.equal(events.at(-1)[0], 'cleanup');
});

test('cancellation prevents installation and waits before cleanup', async () => {
  const controller = new AbortController();
  const { ops, events } = fixture({ signal: controller });
  await assert.rejects(
    installDependencies(ops, { signal: controller.signal }),
    /fixture cancellation/,
  );
  assert.ok(!events.some(([event]) => event === 'install'));
  assert.equal(events.at(-1)[0], 'cleanup');
});

for (const signal of ['SIGTERM', 'SIGINT'])
  test(`supervisor ${signal} cancellation closes its actual child group before returning`, async () => {
    const controller = new AbortController();
    const supervisor = new ProcessSupervisor(controller.signal);
    const result = supervisor.run(process.execPath, [
      '-e',
      'process.stdout.write("ready");setInterval(()=>{},1000)',
    ]);
    const record = [...supervisor.children][0];
    await once(record.child.stdout, 'data');
    controller.abort(new Error(signal));
    const exit = await result;
    await supervisor.close();
    assert.notEqual(exit.code, 0);
    assert.equal(supervisor.children.size, 0);
    await assert.rejects(
      supervisor.checked(process.execPath, ['-e', 'process.exit(0)']),
      new RegExp(signal),
    );
  });

test('one actual failed child terminates active siblings before installer cleanup', async () => {
  const supervisor = new ProcessSupervisor();
  let activeAtCleanup;
  const { ops } = fixture({
    manifest: Array.from({ length: 8 }, (_, id) =>
      archive(`package_${id}.deb`),
    ).join('\n'),
  });
  ops.download = async (_stage, entry) => {
    await supervisor.checked(process.execPath, [
      '-e',
      entry.name === 'package_0.deb'
        ? 'setTimeout(()=>process.exit(9),100)'
        : 'setInterval(()=>{},1000)',
    ]);
  };
  ops.cleanup = async () => {
    activeAtCleanup = supervisor.children.size;
  };
  await assert.rejects(installDependencies(ops, { supervisor }), /failed/);
  assert.equal(activeAtCleanup, 0);
});

test('unexecutable real tool is treated as broken, without a substitute executable', async () => {
  const ops = systemOperations({
    run: async () => {
      throw Object.assign(new Error('not executable'), { code: 'EACCES' });
    },
  });
  assert.equal(await ops.probe('/usr/bin/ffmpeg', ['-version']), false);
});

for (const contents of ['corrupt', 'short'])
  test(`final ${contents} archive blocks installation through the orchestrator`, async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'visual-integrity-test-'),
    );
    try {
      const filename = path.join(directory, 'package.deb');
      await writeFile(filename, contents);
      const { ops, events } = fixture();
      ops.verify = async () => verifyArchive(filename, { size: 7, digest });
      await assert.rejects(installDependencies(ops), /mismatch/);
      assert.ok(!events.some(([event]) => event === 'install'));
      assert.equal(events.at(-1)[0], 'cleanup');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

for (const signal of ['SIGTERM', 'SIGINT'])
  test(`actual ${signal} reaches installer cancellation and awaits child shutdown`, async () => {
    const moduleUrl = new URL(
      './install-visual-runtime-deps.mjs',
      import.meta.url,
    ).href;
    const outer = new ProcessSupervisor();
    const script = `
    import { once } from 'node:events';
    import { ProcessSupervisor, withCancellation } from ${JSON.stringify(moduleUrl)};
    await withCancellation(async (signal) => {
      const supervisor = new ProcessSupervisor(signal);
      try {
        const work = supervisor.checked(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
        const record = [...supervisor.children][0];
        await once(record.child, 'spawn');
        console.log('ready');
        await work;
      } finally {
        await supervisor.close();
        console.log('closed=' + supervisor.children.size);
      }
    }).catch((error) => { console.error(error.message); process.exitCode = 1; });
  `;
    const work = outer.run(process.execPath, [
      '--input-type=module',
      '-e',
      script,
    ]);
    const record = [...outer.children][0];
    await once(record.child.stdout, 'data');
    record.child.kill(signal);
    const result = await work;
    await outer.close();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /cancelled/);
    assert.match(result.stdout, /closed=0/);
  });

test('native mirror acquisition namespaces remain independent in an exclusive-file fixture model', async () => {
  const files = await import('node:fs/promises');
  const base = await mkdtemp(path.join(os.tmpdir(), 'visual-mirror-model-'));
  const release = path.join(base, 'release');
  const partial = path.join(base, 'partial');
  await files.mkdir(partial);
  const supervisor = new ProcessSupervisor();
  let attempted = 0;
  const observed = [];
  const checked = async (command, args) => {
    assert.equal(command, '/usr/lib/apt/apt-helper');
    const listsArg = args.find((arg) => arg.startsWith('Dir::State::lists='));
    const lists =
      listsArg?.slice('Dir::State::lists='.length) ??
      path.join(base, 'shared-lists');
    await files.mkdir(path.join(lists, 'auxfiles'), { recursive: true });
    const offset = args.indexOf('download-file');
    observed.push({ lists, uri: args[offset + 1], hash: args[offset + 3] });
    const script = `
      const fs = require('node:fs/promises');
      const path = require('node:path');
      const [lists, target, release] = process.argv.slice(1);
      const aux = path.join(lists, 'auxfiles', '_etc_apt_apt-mirrors.txt');
      let handle;
      (async () => {
        try {
          handle = await fs.open(aux, 'wx');
          console.log('attempted');
          while (true) {
            try { await fs.stat(release); break; } catch {}
            await new Promise(resolve => setTimeout(resolve, 5));
          }
          await fs.writeFile(target, 'fixture');
          await handle.close();
          await fs.unlink(aux);
        } catch (error) {
          console.log('attempted');
          console.error(error.code);
          process.exitCode = 1;
        }
      })();
    `;
    const resultPromise = supervisor.run(process.execPath, [
      '-e',
      script,
      lists,
      args[offset + 2],
      release,
    ]);
    const record = [...supervisor.children].at(-1);
    let counted = false;
    record.child.stdout.on('data', (data) => {
      if (!counted && data.toString().includes('attempted')) {
        counted = true;
        attempted++;
        if (attempted === 2) void writeFile(release, 'go');
      }
    });
    const result = await resultPromise;
    if (result.code !== 0)
      throw new Error(`fixture acquisition failed: ${result.stderr}`);
    return result.stdout;
  };
  const ownership = [];
  const ops = systemOperations(
    { checked },
    {
      acquisitionFiles: {
        ...files,
        chown: async (...args) => ownership.push(args),
      },
    },
  );
  const entry = parseManifest(archive())[0];
  try {
    const results = await Promise.allSettled(
      [0, 1].map((id) =>
        ops.download(
          { base, partial, sandboxUid: 42 },
          { ...entry, name: `package_${id}.deb` },
        ),
      ),
    );
    assert.deepEqual(
      results.map(({ status }) => status),
      ['fulfilled', 'fulfilled'],
    );
    assert.equal(new Set(observed.map(({ lists }) => lists)).size, 2);
    assert.ok(
      observed.every(
        ({ lists, uri, hash }) =>
          lists.startsWith(base) &&
          lists.endsWith('/') &&
          uri === entry.uri &&
          hash === `SHA256:${entry.digest}`,
      ),
    );
    assert.equal(ownership.length, 2);
    assert.ok(ownership.every(([, uid, gid]) => uid === 42 && gid === 0));
    for (const { lists } of observed)
      assert.equal((await files.stat(lists)).mode & 0o777, 0o755);
  } finally {
    supervisor.stop(new Error('fixture cleanup'));
    await supervisor.close();
    await rm(base, { recursive: true, force: true });
  }
});

test('each auxiliary allocation explicitly preserves sandbox ownership and traversable modes', async () => {
  const events = [];
  const lists = await prepareAcquisition(
    { base: '/tmp/owned', sandboxUid: 42 },
    {
      mkdtemp: async (prefix) => {
        events.push(['mkdtemp', prefix]);
        return '/tmp/owned/apt-lists-fresh';
      },
      chmod: async (...args) => events.push(['chmod', ...args]),
      mkdir: async (...args) => events.push(['mkdir', ...args]),
      chown: async (...args) => events.push(['chown', ...args]),
    },
  );
  assert.equal(lists, '/tmp/owned/apt-lists-fresh');
  assert.deepEqual(events, [
    ['mkdtemp', '/tmp/owned/apt-lists-'],
    ['chmod', lists, 0o755],
    ['mkdir', path.join(lists, 'auxfiles'), { mode: 0o755 }],
    ['chmod', path.join(lists, 'auxfiles'), 0o755],
    ['chown', path.join(lists, 'auxfiles'), 42, 0],
  ]);
  await assert.rejects(
    prepareAcquisition(
      { base: '/tmp/owned' },
      {
        mkdtemp: async () =>
          assert.fail('unverified identity must not allocate'),
      },
    ),
    /verified APT sandbox/,
  );
});

for (const outcome of [
  'success',
  'failure',
  'cancellation',
  'preparation-error',
])
  test(`auxiliary directories survive children and clean only after ${outcome}`, async () => {
    const files = await import('node:fs/promises');
    const base = await mkdtemp(path.join(os.tmpdir(), 'visual-aux-lifetime-'));
    const partial = path.join(base, 'partial');
    await files.mkdir(partial);
    const controller = new AbortController();
    const supervisor = new ProcessSupervisor(controller.signal);
    const { ops, events } = fixture({
      manifest: Array.from({ length: 6 }, (_, id) =>
        archive(`package_${id}.deb`),
      ).join('\n'),
    });
    let peak = 0;
    let cleaned = false;
    const downloads = systemOperations(
      {
        checked: async (_command, args) => {
          const lists = args
            .find((arg) => arg.startsWith('Dir::State::lists='))
            .slice('Dir::State::lists='.length);
          const offset = args.indexOf('download-file');
          const script = `
          const fs = require('node:fs');
          const path = require('node:path');
          const [lists, outcome, target] = process.argv.slice(1);
          fs.writeFileSync(path.join(lists, 'auxfiles', 'mirror'), 'native fixture state');
          console.log('ready');
          if (outcome === 'success') setTimeout(() => { fs.writeFileSync(target, 'fixture'); }, 20);
          else if (outcome === 'failure' && target.endsWith('package_0.deb')) setTimeout(() => process.exit(9), 100);
          else setInterval(() => {}, 1000);
        `;
          const work = supervisor.checked(process.execPath, [
            '-e',
            script,
            lists,
            outcome,
            args[offset + 2],
          ]);
          peak = Math.max(peak, supervisor.children.size);
          const record = [...supervisor.children].at(-1);
          if (outcome === 'cancellation')
            record.child.stdout.once('data', () =>
              controller.abort(new Error('fixture cancellation')),
            );
          return work;
        },
      },
      {
        acquisitionFiles: {
          ...files,
          chown: async () => {},
          chmod: async (...args) => {
            if (outcome === 'preparation-error')
              throw new Error('auxiliary permission failure');
            return files.chmod(...args);
          },
        },
      },
    );
    ops.prepare = async () => ({ base, partial, sandboxUid: 42 });
    ops.download = downloads.download;
    ops.cleanup = async () => {
      assert.equal(supervisor.children.size, 0);
      assert.ok(
        (await files.readdir(base)).some((name) =>
          name.startsWith('apt-lists-'),
        ),
      );
      await rm(base, { recursive: true, force: true });
      cleaned = true;
    };
    try {
      const work = installDependencies(ops, {
        signal: controller.signal,
        supervisor,
      });
      if (outcome === 'success') await work;
      else await assert.rejects(work);
      assert.ok(cleaned);
      assert.ok(peak <= 4);
      if (outcome === 'success') assert.equal(peak, 4);
      else assert.ok(!events.some(([event]) => event === 'install'));
      await assert.rejects(files.stat(base), { code: 'ENOENT' });
    } finally {
      supervisor.stop(new Error('fixture cleanup'));
      await supervisor.close();
      await rm(base, { recursive: true, force: true });
    }
  });
