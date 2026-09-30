import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { containerName, dockerArguments } from './coordinator.mjs';
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
const artifacts = resolve('visual-code-artifacts');
await mkdir(artifacts, { recursive: true });
await exec('runsc', ['--version']);
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
const source = `import React from 'react';
import {AbsoluteFill,Img,OffthreadVideo,Audio,staticFile,useCurrentFrame,interpolate} from 'remotion';
export function VisualComposition(){const frame=useCurrentFrame();return <AbsoluteFill style={{background:'#141b2d',color:'white',padding:32,fontFamily:'DejaVu Sans'}}><OffthreadVideo src={staticFile('assets/clip')} style={{width:160,height:90}}/><Img src={staticFile('assets/image')} style={{width:48,height:48}}/><Audio src={staticFile('assets/audio')}/><div style={{fontSize:32,transform:'translateY('+interpolate(frame,[0,29],[20,0])+'px)'}}>Visual code acceptance</div></AbsoluteFill>}`;
for (const [name, args] of [
  [
    'image.png',
    ['-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1'],
  ],
  [
    'clip.mp4',
    [
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=160x90:r=30',
      '-t',
      '1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
    ],
  ],
  ['audio.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1']],
])
  await exec('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    ...args,
    resolve(artifacts, name),
  ]);
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
assert.equal(rendered.code, 0, rendered.stderr);
const result = validateResult(decodeFrame(rendered.bytes), input);
assert.deepEqual(result.diagnostics, []);
for (const [index, media] of result.media.entries())
  await writeFile(
    resolve(artifacts, `hybrid-${index}.${media.format}`),
    Buffer.from(media.bytes, 'base64'),
  );
const attackId = 'acceptance-isolation';
const attack = `const fs=require('node:fs');const cp=require('node:child_process');const assert=require('node:assert/strict');(async()=>{assert.equal(process.env.VISUAL_CODE_RENDERER_TOKEN,undefined);assert.equal(process.env.VISUAL_CODE_TEST_SECRET,undefined);assert.throws(()=>fs.readFileSync('/tmp/visual-code-host-sentinel'));assert.throws(()=>fs.writeFileSync('/runtime/installed-by-attacker','bad'));let denied=false;try{await fetch('https://example.com',{signal:AbortSignal.timeout(3000)})}catch{denied=true}assert.ok(denied);const installation=cp.spawnSync('npm',['install','--offline','--prefix','/runtime','never-installed-package'],{timeout:5000});assert.notEqual(installation.status,0);process.stdout.write('isolation-denied')} )().catch(()=>process.exit(1));`;
await writeFile('/tmp/visual-code-host-sentinel', 'host-only');
process.env.VISUAL_CODE_TEST_SECRET = 'must-not-cross-boundary';
const args = dockerArguments(attackId);
args.splice(-1, 1, '-e', attack);
const attacked = await isolated(attackId, args);
assert.equal(attacked.code, 0, attacked.stderr);
assert.equal(attacked.bytes.toString(), 'isolation-denied');
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
