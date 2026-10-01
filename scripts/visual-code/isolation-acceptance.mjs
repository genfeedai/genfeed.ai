import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import { containerName, dockerArguments, verifyVideo } from './coordinator.mjs';
import { createFixtureMedia } from './create-fixture-media.mjs';
import {
  decodeFrame,
  encodeFrame,
  validateInput,
  validateResult,
} from './protocol.mjs';

const exec = promisify(execFile);
assert.equal(
  process.platform,
  'linux',
  'Actual gVisor acceptance requires Linux.',
);
const artifactOption = process.env.VISUAL_CODE_ARTIFACT_DIR;
if (artifactOption)
  assert.ok(isAbsolute(artifactOption), 'Artifact root must be absolute');
const artifacts = artifactOption ?? resolve('visual-code-artifacts');
await mkdir(artifacts, { recursive: true, mode: 0o700 });
assert.equal((await lstat(artifacts)).isSymbolicLink(), false);
await assert.rejects(lstat(resolve(artifacts, 'evidence.json')), {
  code: 'ENOENT',
});
const gitHead =
  process.env.VISUAL_CODE_ACCEPTANCE_HEAD ??
  (await exec('git', ['rev-parse', 'HEAD'])).stdout.trim();
assert.match(gitHead, /^[a-f0-9]{40}$/);
const runscVersion = (await exec('runsc', ['--version'])).stdout.trim();
const imageId = (
  await exec('docker', [
    'image',
    'inspect',
    'genfeed-visual-code:4.0.530',
    '--format',
    '{{.Id}}',
  ])
).stdout.trim();
assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
const containerFacts = [];

const info = JSON.parse(
  (await exec('docker', ['info', '--format', '{{json .Runtimes}}'])).stdout,
);
assert.ok(info.runsc, 'No fallback is allowed when runsc is missing.');
async function isolated(id, args, input, deadline = 120_000) {
  let child;
  try {
    return await new Promise((accept, reject) => {
      child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks = [];
      let size = 0;
      const errors = [];
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('deadline'));
      }, deadline);
      child.on('error', reject);
      child.stdin.on('error', () => {});
      child.stdout.on('data', (chunk) => {
        size += chunk.length;
        if (size > 64 * 1024 * 1024 + 4) {
          child.kill('SIGKILL');
          reject(new Error('output_limit'));
        } else chunks.push(chunk);
      });
      child.stderr.on('data', (chunk) => {
        if (errors.length < 4) errors.push(chunk);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        accept({
          code,
          bytes: Buffer.concat(chunks),
          stderr: Buffer.concat(errors).toString(),
        });
      });
      child.stdin.end(input);
    });
  } finally {
    try {
      for (const operation of ['inspect', 'logs']) {
        const evidence = await exec(
          'docker',
          operation === 'logs'
            ? ['logs', '--tail', '100', containerName(id)]
            : ['inspect', containerName(id)],
          { timeout: 10_000, maxBuffer: 64 * 1024 },
        ).catch((error) => ({
          stdout: error.stdout ?? '',
          stderr: error.stderr ?? error.message,
        }));
        if (operation === 'inspect' && evidence.stdout) {
          const inspected = JSON.parse(evidence.stdout)[0];
          const config = inspected.HostConfig;
          assert.equal(config.Runtime, 'runsc');
          assert.equal(config.NetworkMode, 'none');
          assert.equal(config.ReadonlyRootfs, true);
          assert.equal(config.Privileged, false);
          assert.ok(!inspected.Mounts.some((mount) => mount.Type === 'bind'));
          assert.ok(!config.Binds || config.Binds.length === 0);
          assert.equal(config.Memory, 2 * 1024 * 1024 * 1024);
          assert.equal(config.NanoCpus, 2 * 1e9);
          assert.equal(config.PidsLimit, 256);
          assert.ok(config.CapDrop.includes('ALL'));
          assert.ok(config.SecurityOpt.includes('no-new-privileges'));
          containerFacts.push({
            id,
            image: inspected.Image,
            runtime: config.Runtime,
            networkMode: config.NetworkMode,
            readonlyRootfs: config.ReadonlyRootfs,
            privileged: config.Privileged,
            mounts: inspected.Mounts,
            memory: config.Memory,
            nanoCpus: config.NanoCpus,
            pidsLimit: config.PidsLimit,
            capDrop: config.CapDrop,
            securityOpt: config.SecurityOpt,
            user: inspected.Config.User,
          });
        }
        await writeFile(
          resolve(artifacts, `${id}-${operation}.txt`),
          `${evidence.stdout}\n${evidence.stderr}`.slice(0, 64 * 1024),
        );
      }
    } finally {
      await exec('docker', ['rm', '-f', containerName(id)]).catch(() => {});
      const remaining = await exec('docker', [
        'ps',
        '-aq',
        '--filter',
        `name=^/${containerName(id)}$`,
      ]);
      assert.equal(
        remaining.stdout.trim(),
        '',
        'Container must be removed on every exit.',
      );
    }
  }
}
const source = `import React from 'react';
import {AbsoluteFill,Img,OffthreadVideo,Audio,staticFile,useCurrentFrame,interpolate} from 'remotion';
export function VisualComposition(){const frame=useCurrentFrame();return <AbsoluteFill style={{background:'#141b2d',color:'white',padding:32,fontFamily:'DejaVu Sans'}}><OffthreadVideo src={staticFile('assets/clip')} style={{width:160,height:90}}/><Img src={staticFile('assets/image')} style={{width:48,height:48}}/><Audio src={staticFile('assets/audio')}/><div style={{fontSize:32,transform:'translateY('+interpolate(frame,[0,29],[20,0])+'px)'}}>Visual code acceptance</div></AbsoluteFill>}`;
await createFixtureMedia(artifacts);
const assets = await Promise.all(
  [
    ['image', 'image/png', 'image.png'],
    ['clip', 'video/mp4', 'clip.mp4'],
    ['audio', 'audio/wav', 'audio.wav'],
  ].map(async ([id, mime, file]) => ({
    id,
    mime,
    bytes: (await readFile(resolve(artifacts, file))).toString('base64'),
  })),
);
const input = validateInput({
  id: 'acceptance-hybrid',
  sourceCode: source,
  settings: { width: 640, height: 360, fps: 30, durationFrames: 30 },
  props: {},
  assets,
  outputs: [
    { format: 'mp4' },
    { format: 'png', frame: 0 },
    { format: 'jpeg', frame: 15 },
  ],
  mode: 'export',
});
const rendered = await isolated(
  input.id,
  dockerArguments(input.id),
  encodeFrame(input),
);
const decoded = decodeFrame(rendered.bytes);
await writeFile(
  resolve(artifacts, 'runner-diagnostics.json'),
  JSON.stringify(
    {
      code: rendered.code,
      diagnostics: decoded.diagnostics,
      stderr: rendered.stderr.slice(0, 8192),
    },
    null,
    2,
  ),
);
assert.equal(rendered.code, 0, JSON.stringify(decoded.diagnostics));
const result = validateResult(decoded, input);
assert.deepEqual(result.diagnostics, []);
const mp4 = result.media.find((media) => media.format === 'mp4');
const videoProbe = await verifyVideo(mp4, input);
await writeFile(
  resolve(artifacts, 'video-probe.json'),
  JSON.stringify(videoProbe, null, 2),
);
await assert.rejects(
  verifyVideo(
    { ...mp4, bytes: Buffer.from('0000ftypisom').toString('base64') },
    input,
  ),
  /video_probe_failed/,
);
await assert.rejects(
  verifyVideo(mp4, { ...input, settings: { ...input.settings, width: 642 } }),
  /invalid_video_dimensions_or_codec/,
);
const cancelledProbe = new AbortController();
cancelledProbe.abort();
await assert.rejects(verifyVideo(mp4, input, cancelledProbe.signal));
const interruptedProbe = new AbortController();
const pendingProbe = verifyVideo(mp4, input, interruptedProbe.signal);
queueMicrotask(() => interruptedProbe.abort());
await assert.rejects(pendingProbe);
for (const [index, media] of result.media.entries())
  await writeFile(
    resolve(artifacts, `hybrid-${index}.${media.format}`),
    Buffer.from(media.bytes, 'base64'),
  );
const attackId = 'acceptance-isolation';
const attack = `const fs=require('node:fs');const cp=require('node:child_process');const assert=require('node:assert/strict');(async()=>{assert.equal(process.env.VISUAL_CODE_RENDERER_TOKEN,undefined);assert.equal(process.env.VISUAL_CODE_TEST_SECRET,undefined);assert.throws(()=>fs.readFileSync('/tmp/visual-code-host-sentinel'));assert.throws(()=>fs.writeFileSync('/runtime/installed-by-attacker','bad'));let denied=false;try{await fetch('https://example.com',{signal:AbortSignal.timeout(3000)})}catch{denied=true}assert.ok(denied);const installation=cp.spawnSync('npm',['install','--offline','--prefix','/runtime','never-installed-package'],{timeout:5000});assert.notEqual(installation.status,0);process.stdout.write('isolation-denied')} )().catch(()=>process.exit(1));`;
await writeFile('/tmp/visual-code-host-sentinel', 'host-only', { flag: 'wx' });
const previousSecret = process.env.VISUAL_CODE_TEST_SECRET;
try {
  process.env.VISUAL_CODE_TEST_SECRET = 'must-not-cross-boundary';
  const args = dockerArguments(attackId);
  args.splice(-1, 1, '-e', attack);
  const attacked = await isolated(attackId, args);
  assert.equal(attacked.code, 0, attacked.stderr);
  assert.equal(attacked.bytes.toString(), 'isolation-denied');
} finally {
  await unlink('/tmp/visual-code-host-sentinel');
  if (previousSecret === undefined) delete process.env.VISUAL_CODE_TEST_SECRET;
  else process.env.VISUAL_CODE_TEST_SECRET = previousSecret;
}
const deadlineId = 'acceptance-deadline';
const deadlineArgs = dockerArguments(deadlineId);
deadlineArgs.splice(-1, 1, '-e', 'while(true){}');
await assert.rejects(
  isolated(deadlineId, deadlineArgs, undefined, 1500),
  /deadline/,
);
await writeFile(
  resolve(artifacts, 'evidence.json'),
  JSON.stringify(
    {
      gitHead,
      timestamp: new Date().toISOString(),
      imageId,
      runscVersion,
      containerFacts,
      rendererVersion: '4.0.530',
      runtime: 'runsc',
      hybridFormats: ['mp4', 'png', 'jpeg'],
      networkDenied: true,
      hostFilesDenied: true,
      credentialsAbsent: true,
      packageInstallationDenied: true,
      deadlineCleanup: true,
    },
    null,
    2,
  ),
);
process.stdout.write(
  'Actual runsc hybrid-render and isolation acceptance passed.\n',
);
