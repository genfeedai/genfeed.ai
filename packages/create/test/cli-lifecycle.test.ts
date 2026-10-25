import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const logsCommand =
  'docker compose --env-file .env -f compose.yml logs genfeed';
let fixtureDirectory: string;

beforeAll(async () => {
  const tarLookup = spawnSync('sh', ['-c', 'command -v tar'], {
    encoding: 'utf8',
  });
  if (tarLookup.error || tarLookup.status !== 0 || !tarLookup.stdout.trim()) {
    throw new Error('tar is required for the offline CLI fixtures.');
  }
  const systemTar = await realpath(tarLookup.stdout.trim());
  fixtureDirectory = await realpath(
    await mkdtemp(join(tmpdir(), 'genfeed-cli-lifecycle-')),
  );
  const runtime = join(fixtureDirectory, 'runtime');
  const bundle = join(fixtureDirectory, 'bundle');
  const bin = join(fixtureDirectory, 'bin');
  await Promise.all([
    mkdir(join(runtime, 'dist'), { recursive: true }),
    mkdir(bundle),
    mkdir(bin),
  ]);
  await symlink(
    join(packageDirectory, 'node_modules'),
    join(runtime, 'node_modules'),
  );
  await writeFile(
    join(runtime, 'package.json'),
    await readFile(join(packageDirectory, 'package.json')),
  );
  for (const filename of (await readdir(join(packageDirectory, 'src'))).filter(
    (name) => name.endsWith('.ts'),
  )) {
    const name = filename.slice(0, -3);
    const source = await readFile(
      join(packageDirectory, 'src', `${name}.ts`),
      'utf8',
    );
    await writeFile(
      join(runtime, 'dist', `${name}.js`),
      stripTypeScriptTypes(source),
    );
  }
  await Promise.all([
    writeFile(join(bundle, '.env.example'), 'GENFEED_IMAGE_TAG=0.5.0\n'),
    writeFile(join(bundle, 'compose.yml'), 'services: {}\n'),
    writeFile(
      join(bundle, 'release.json'),
      JSON.stringify({
        schemaVersion: 1,
        releaseTag: 'v0.5.0',
        image: 'ghcr.io/genfeedai/genfeed.ai:0.5.0',
      }),
    ),
  ]);
  const archive = join(fixtureDirectory, 'bundle.tar.gz');
  const packed = spawnSync(systemTar, [
    '-czf',
    archive,
    '-C',
    fixtureDirectory,
    'bundle',
  ]);
  expect(packed.status).toBe(0);
  const digest = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  await writeFile(
    join(fixtureDirectory, 'preload.mjs'),
    `
    import { readFileSync } from 'node:fs';
    const archive = readFileSync(${JSON.stringify(archive)});
    globalThis.fetch = async (input, options) => {
      if ((process.env.FIXTURE_MODE === 'cancel-download' && String(input).endsWith('.tar.gz')) || (process.env.FIXTURE_MODE === 'cancel-readiness' && String(input) === 'http://localhost:3000')) {
        return new Promise((_resolve, reject) => {
          const connection = setInterval(() => {}, 1000);
          options.signal.addEventListener('abort', () => { clearInterval(connection); reject(options.signal.reason); }, { once: true });
          process.stdout.write('fixture:' + process.env.FIXTURE_MODE.slice(7) + '\\n');
        });
      }
      const url = String(input);
      if (url.endsWith('.tar.gz')) return new Response(archive);
      if (url.endsWith('.sha256')) return new Response('${digest}  genfeed-selfhosted.tar.gz\\n');
      if (url !== 'http://localhost:3000') throw new Error('Unexpected fixture request');
      if (process.env.FIXTURE_MODE === 'redirect') return new Response(null, { status: 302 });
      if (['ready', 'array-ready', 'unhealthy-ready'].includes(process.env.FIXTURE_MODE)) return new Response('ready');
      if (process.env.FIXTURE_MODE === 'crashes') throw new Error('Fixture connection refused');
      Date.now = () => Number.MAX_SAFE_INTEGER;
      throw new Error('Fixture connection refused');
    };
  `,
  );
  await writeFile(
    join(bin, 'docker'),
    `#!${process.execPath}
    const { appendFileSync, readFileSync, writeFileSync, existsSync } = require('node:fs');
    const args = process.argv.slice(2);
    appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
    const command = args[1] === 'version' ? 'version' : args[5];
    if ((command === 'config' && ['cancel-config', 'cancel-stubborn'].includes(process.env.FIXTURE_MODE)) || (command === 'up' && process.env.FIXTURE_MODE === 'cancel-up')) {
      process.on('SIGTERM', () => {
        writeFileSync(process.env.FIXTURE_CHILD_RECEIPT, JSON.stringify({ pid: process.pid, directoryExistedAtTermination: existsSync(process.cwd()) }));
        if (process.env.FIXTURE_MODE !== 'cancel-stubborn') setTimeout(() => process.exit(0), 150);
      });
      writeFileSync(process.env.FIXTURE_READY, 'fixture:' + command);
      setInterval(() => {}, 1000);
      return;
    }
    if (command === 'version' || command === 'config') process.exit(0);
    if (command === 'up') process.exit(process.env.FIXTURE_MODE === 'up-failure' ? 23 : 0);
    if (command !== 'ps') process.exit(99);
    if (process.env.FIXTURE_MODE === 'status-failure') process.exit(17);
    if (process.env.FIXTURE_MODE === 'invalid-status') { process.stdout.write('not json'); process.exit(0); }
    if (process.env.FIXTURE_MODE === 'invalid-shape') { process.stdout.write('{"State":"running"}'); process.exit(0); }
    if (process.env.FIXTURE_MODE === 'missing') process.exit(0);
    const probes = readFileSync(process.env.FIXTURE_CALLS, 'utf8').split('\\n').filter(line => line.includes('"ps"')).length;
    const state = process.env.FIXTURE_MODE === 'exited' || (process.env.FIXTURE_MODE === 'crashes' && probes > 1) ? 'exited' : 'running';
    const health = process.env.FIXTURE_MODE.startsWith('unhealthy') ? 'unhealthy' : 'starting';
    const container = { Service: 'genfeed', State: state, Health: health, ExitCode: state === 'exited' ? 42 : 0 };
    const json = JSON.stringify(container);
    process.stdout.write(process.env.FIXTURE_MODE.startsWith('array-') ? '[' + json + ']' : json + '\\n');
  `,
    { mode: 0o700 },
  );
  await writeFile(
    join(bin, 'tar'),
    `#!${process.execPath}
    const { spawnSync } = require('node:child_process');
    const { writeFileSync, existsSync } = require('node:fs');
    const args = process.argv.slice(2);
    if (process.env.FIXTURE_MODE === 'cancel-extract' && args.includes('-xzf')) {
      const target = args[args.indexOf('-C') + 1];
      writeFileSync(require('node:path').join(target, 'partial.txt'), 'partial extraction');
      process.on('SIGTERM', () => {
        writeFileSync(process.env.FIXTURE_CHILD_RECEIPT, JSON.stringify({ pid: process.pid, directoryExistedAtTermination: existsSync(target) }));
        setTimeout(() => process.exit(0), 150);
      });
      writeFileSync(process.env.FIXTURE_READY, 'fixture:extract');
      setInterval(() => {}, 1000);
    } else {
      const result = spawnSync(${JSON.stringify(systemTar)}, args, { stdio: 'inherit' });
      process.exit(result.status ?? 1);
    }
  `,
    { mode: 0o700 },
  );
  for (const browser of ['open', 'xdg-open']) {
    await writeFile(join(bin, browser), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  }
});

afterAll(async () => {
  if (fixtureDirectory)
    await rm(fixtureDirectory, { recursive: true, force: true });
});

async function runCli(mode: string) {
  const installation = join(fixtureDirectory, mode);
  const calls = join(fixtureDirectory, `${mode}.calls`);
  const child = spawn(
    process.execPath,
    [
      '--import',
      join(fixtureDirectory, 'preload.mjs'),
      join(fixtureDirectory, 'runtime', 'dist', 'index.js'),
      installation,
      '--release',
      'v0.5.0',
      '--yes',
    ],
    {
      cwd: fixtureDirectory,
      env: {
        PATH: `${join(fixtureDirectory, 'bin')}:${process.env.PATH}`,
        OPENROUTER_API_KEY: 'sk-or-offline-fixture',
        SELFHOSTED_DOMAIN: '',
        FIXTURE_MODE: mode,
        FIXTURE_CALLS: calls,
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (data: Buffer) => {
    output += data.toString();
  });
  child.stderr.on('data', (data: Buffer) => {
    output += data.toString();
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI fixture timed out: ${output}`));
    }, 8_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (status) => {
      clearTimeout(timeout);
      resolve(status);
    });
  });
  return { code, output, installation, calls: await readFile(calls, 'utf8') };
}

describe('CLI readiness outcome', () => {
  it.each([
    ['exited', 'exited with code 42'],
    ['crashes', 'exited with code 42'],
    ['unhealthy', 'unhealthy'],
    ['unhealthy-ready', 'unhealthy'],
    ['missing', 'No genfeed container'],
    ['invalid-status', 'Could not read the genfeed container status'],
    ['invalid-shape', 'Could not read the genfeed container status'],
    ['status-failure', 'Could not read the genfeed container status'],
    ['timeout', 'did not become ready within 180 seconds'],
    ['array-status', 'did not become ready within 180 seconds'],
  ])(
    'exits nonzero for %s and preserves recovery files',
    async (mode, diagnostic) => {
      const result = await runCli(mode);
      expect(result.code).toBe(1);
      expect(result.output).toContain(diagnostic);
      expect(result.output).toContain(logsCommand);
      expect(result.output).toContain('Installation files were preserved');
      expect(result.output).not.toContain('Genfeed.ai is running');
      expect(result.output).not.toContain('sk-or-offline-fixture');
      expect(
        await readFile(join(result.installation, '.env'), 'utf8'),
      ).toContain('GENFEED_IMAGE_TAG=0.5.0');
      const calls = result.calls
        .trim()
        .split('\n')
        .map((line): unknown => JSON.parse(line));
      expect(calls).toContainEqual({
        args: [
          'compose',
          '--env-file',
          '.env',
          '-f',
          'compose.yml',
          'ps',
          '--all',
          '--format',
          'json',
          'genfeed',
        ],
        cwd: result.installation,
      });
    },
  );

  it.each(['ready', 'redirect', 'array-ready'])(
    'keeps %s readiness successful',
    async (mode) => {
      const result = await runCli(mode);
      expect(result.code).toBe(0);
      expect(result.output).toContain(
        'Genfeed.ai is running at http://localhost:3000',
      );
      expect(result.output).not.toContain('Startup failed');
    },
  );

  it('keeps the original startup command failure and recovery files', async () => {
    const result = await runCli('up-failure');
    expect(result.code).toBe(1);
    expect(result.output).toContain('failed with 23');
    expect(result.output).toContain(logsCommand);
    expect(
      await readFile(join(result.installation, 'release.json'), 'utf8'),
    ).toContain('v0.5.0');
  });
});

const interruptionProbe = String.raw`
import hashlib,json,os,pty,select,signal,subprocess,sys,termios,time
from pathlib import Path
settings=json.loads(sys.argv[1])
directory=Path(settings['directory']);directory.mkdir()
target=directory/'installation';temporary=directory/'tmp';temporary.mkdir()
ready=directory/'ready';child_receipt=directory/'child.json'
env={'PATH':settings['bin']+':'+os.environ['PATH'],'TERM':'xterm','NO_COLOR':'1','TMPDIR':str(temporary),'FIXTURE_MODE':'cancel-'+settings['phase'],'FIXTURE_CALLS':str(directory/'calls'),'FIXTURE_CHILD_RECEIPT':str(child_receipt),'FIXTURE_READY':str(ready)}
argv=[settings['node'],'--import',settings['preload'],settings['entry'],str(target),'--release','v0.5.0']
if settings['phase'] not in ['up','readiness']:argv+=['--no-start']
if settings['phase']!='prompt':
    argv+=['--yes'];env.update(OPENROUTER_API_KEY='sk-or-offline-fixture',SELFHOSTED_DOMAIN='')
def snapshot(path):
    if path.is_symlink():return {'link':os.readlink(path)}
    if not path.exists():return None
    if path.is_file():return {'hash':hashlib.sha256(path.read_bytes()).hexdigest(),'inode':path.stat().st_ino}
    return {item.name:snapshot(item) for item in sorted(path.iterdir())}
pid,fd=pty.fork()
if pid==0:
    os.chdir(directory);os.execve(settings['node'],argv,env)
output=b'';status=None
try:
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        if select.select([fd],[],[],0.02)[0]:
            try:output+=os.read(fd,65536)
            except OSError:pass
        if settings['phase']=='prompt':
            if b'OpenRouter API key (hidden): ' in output and not(termios.tcgetattr(fd)[3]&termios.ICANON):break
        elif ('fixture:'+settings['phase']).encode() in output or ready.exists():break
    else:raise RuntimeError('Fixture did not become ready: '+output.decode(errors='replace'))
    change=settings['change']
    if change=='edited':(target/'.env.example').write_text('user edited data\n')
    if change=='added':(target/'user-note.txt').write_text('user added data\n')
    if change in ['replaced','symlink']:
        original=target/'.env.example';original.rename(directory/'original-file')
        if change=='replaced':original.write_bytes((directory/'original-file').read_bytes())
        else:original.symlink_to(directory/'original-file')
    if change in ['root-replaced','root-symlink']:
        target.rename(directory/'original-directory')
        if change=='root-replaced':target.mkdir();(target/'user-note.txt').write_text('replacement directory')
        else:
            foreign=directory/'foreign';foreign.mkdir();(foreign/'user-note.txt').write_text('foreign data');target.symlink_to(foreign,target_is_directory=True)
    expected=snapshot(target)
    time.sleep(0.05)
    if settings['interrupt']=='typed':os.write(fd,b'\x03')
    else:os.kill(pid,getattr(signal,settings['interrupt']))
    if settings['repeated']:
        time.sleep(0.02);os.kill(pid,signal.SIGHUP);os.kill(pid,signal.SIGINT)
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        if select.select([fd],[],[],0.02)[0]:
            try:output+=os.read(fd,65536)
            except OSError:pass
        found,state=os.waitpid(pid,os.WNOHANG)
        if found:status=os.waitstatus_to_exitcode(state);break
    if status is None:raise RuntimeError('Interrupted installer did not drain and exit')
finally:
    if status is None:
        os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)
    os.close(fd)
(directory/'interruption.log').write_bytes(output)
preserved=target.exists() or target.is_symlink()
whole_preserved=preserved and snapshot(target)==expected
child=None
if child_receipt.exists():
    child=json.loads(child_receipt.read_text())
    try:os.kill(child['pid'],0);child['exited']=False
    except ProcessLookupError:child['exited']=True
rerun_env={**env,'FIXTURE_MODE':'rerun','OPENROUTER_API_KEY':'sk-or-offline-fixture','SELFHOSTED_DOMAIN':''}
rerun=subprocess.run([settings['node'],'--import',settings['preload'],settings['entry'],str(target),'--release','v0.5.0','--yes','--no-start'],cwd=directory,env=rerun_env,capture_output=True,text=True,timeout=10)
service_cleanup=any(any(arg in ['down','stop','rm'] for arg in json.loads(line)['args']) for line in (directory/'calls').read_text().splitlines())
print('RESULT:'+json.dumps({'serviceCleanupAttempted':service_cleanup,'exitCode':status,'destinationPreserved':preserved,'wholePreserved':whole_preserved,'rerunExitCode':rerun.returncode,'rerunExistsError':'Destination already exists' in rerun.stdout+rerun.stderr,'temporaryEmpty':not list(temporary.iterdir()),'changedDiagnostic':'changed' in output.decode(errors='replace'),'child':child}))
`;

async function interruptInstaller(
  phase: string,
  interrupt: string,
  change = 'none',
  repeated = false,
) {
  const directory = join(
    fixtureDirectory,
    `interrupt-${phase}-${interrupt}-${change}-${repeated}`,
  );
  const result = spawnSync(
    'python3',
    [
      '-c',
      interruptionProbe,
      JSON.stringify({
        directory,
        phase,
        interrupt,
        change,
        repeated,
        node: process.execPath,
        bin: join(fixtureDirectory, 'bin'),
        preload: join(fixtureDirectory, 'preload.mjs'),
        entry: join(fixtureDirectory, 'runtime/dist/index.js'),
      }),
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const serialized = result.stdout.split('RESULT:').at(-1);
  expect(serialized).toBeTruthy();
  if (!serialized) throw new Error('Missing interruption receipt');
  const receipt: unknown = JSON.parse(serialized);
  return receipt;
}

describe('installer interruption', () => {
  it.each([
    ['typed', 130],
    ['SIGINT', 130],
    ['SIGHUP', 129],
    ['SIGTERM', 143],
  ])(
    'cleans unchanged prompt files for %s and permits rerun',
    async (signal, code) => {
      const receipt = await interruptInstaller('prompt', String(signal));
      expect(receipt).toMatchObject({
        exitCode: code,
        destinationPreserved: false,
        temporaryEmpty: true,
        rerunExitCode: 0,
      });
    },
  );

  it.each([
    'edited',
    'added',
    'replaced',
    'symlink',
    'root-replaced',
    'root-symlink',
  ])('preserves the whole %s destination at cancellation', async (change) => {
    const receipt = await interruptInstaller('prompt', 'typed', change);
    expect(receipt).toMatchObject({
      exitCode: 130,
      wholePreserved: true,
      changedDiagnostic: true,
      rerunExitCode: 1,
      rerunExistsError: true,
    });
  });

  it.each(['download', 'extract', 'config', 'stubborn'])(
    'cancels %s preparation, drains work and permits rerun',
    async (phase) => {
      const receipt = await interruptInstaller(phase, 'SIGHUP');
      expect(receipt).toMatchObject({
        exitCode: 129,
        destinationPreserved: false,
        temporaryEmpty: true,
        rerunExitCode: 0,
      });
      if (phase !== 'download')
        expect(receipt).toMatchObject({
          child: { directoryExistedAtTermination: true, exited: true },
        });
    },
  );

  it('keeps the first interruption and drains its child across repeated signals', async () => {
    const receipt = await interruptInstaller('config', 'SIGINT', 'none', true);
    expect(receipt).toMatchObject({
      exitCode: 130,
      child: { directoryExistedAtTermination: true, exited: true },
      temporaryEmpty: true,
      rerunExitCode: 0,
    });
  });

  it.each(['up', 'readiness'])(
    'preserves all installation files after %s begins',
    async (phase) => {
      const receipt = await interruptInstaller(phase, 'SIGTERM');
      expect(receipt).toMatchObject({
        exitCode: 143,
        wholePreserved: true,
        serviceCleanupAttempted: false,
        rerunExistsError: true,
        temporaryEmpty: true,
      });
      if (phase === 'up')
        expect(receipt).toMatchObject({
          child: { directoryExistedAtTermination: true, exited: true },
        });
    },
  );
});
