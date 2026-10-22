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
  const ops = systemOperations({
    checked: async (...args) => {
      calls.push(args);
      return '';
    },
  });
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
      'download-file',
      entry.uri,
      path.join(stage.partial, entry.name),
      `SHA256:${digest}`,
    ],
  ]);
  assert.ok(calls[3][1].includes('--no-download'));
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
