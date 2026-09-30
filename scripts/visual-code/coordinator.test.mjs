import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  authorized,
  Coordinator,
  containerName,
  dockerArguments,
} from './coordinator.mjs';

test('container command has fixed mandatory isolation and never interpolates source', () => {
  const args = dockerArguments('untrusted-id');
  for (const option of [
    '--runtime=runsc',
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user=65532:65532',
    '--cpus=2',
    '--memory=2g',
    '--pids-limit=256',
  ])
    assert.ok(args.includes(option));
  assert.ok(
    !args.some(
      (arg) =>
        arg.includes('/var/run/docker.sock') ||
        arg.startsWith('--volume') ||
        arg.startsWith('--env') ||
        arg.startsWith('--privileged'),
    ),
  );
  assert.equal(containerName('bad/../id'), containerName('bad/../id'));
  assert.match(containerName('bad/../id'), /^visual-code-[a-f0-9]{40}$/);
});
test('internal authentication requires exact bearer token', () => {
  assert.equal(authorized('Bearer test', 'test'), true);
  assert.equal(authorized('Bearer testx', 'test'), false);
  assert.equal(authorized(undefined, 'test'), false);
});
test('concurrent identical admissions persist one source-free receipt and conflicting replay fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'visual-coordinator-'));
  try {
    const coordinator = new Coordinator(directory);
    coordinator.isReady = true;
    let calls = 0;
    coordinator.execute = async () => {
      calls++;
    };
    const input = {
      id: 'revision-1',
      sourceCode: 'export const VisualComposition = () => null;',
      props: {},
      settings: { width: 1080, height: 1920, fps: 30, durationFrames: 450 },
      assets: [],
      outputs: [{ format: 'mp4' }],
      mode: 'preview',
    };
    const [first, second] = await Promise.all([
      coordinator.submit(input),
      coordinator.submit(input),
    ]);
    assert.deepEqual(first, second);
    assert.equal(calls, 1);
    await assert.rejects(
      coordinator.submit({ ...input, sourceCode: 'different' }),
      /idempotency_conflict/,
    );
    const persisted = await readFile(coordinator.manifest(input.id), 'utf8');
    assert.ok(!persisted.includes('VisualComposition'));
    assert.equal(JSON.parse(persisted).status, 'running');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const [name, output, diagnostic, hasResult] of [
  [
    'malformed JSON',
    Buffer.from([0, 0, 0, 1, 123]),
    'renderer_output_invalid',
    false,
  ],
  ['truncated frame', Buffer.from([0, 0]), 'truncated_frame', false],
  [
    'runner diagnostics',
    (() => {
      const bytes = Buffer.from(
        JSON.stringify({
          rendererVersion: '4.0.530',
          media: [],
          diagnostics: ['compile failed'],
        }),
      );
      const header = Buffer.alloc(4);
      header.writeUInt32BE(bytes.length);
      return Buffer.concat([header, bytes]);
    })(),
    'render_failed',
    true,
  ],
]) {
  test(`actual subprocess ${name} persists the correct failed receipt`, async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'visual-coordinator-output-'),
    );
    const previousPath = process.env.PATH;
    try {
      // This unit-only executable consumes the framed input; no Docker daemon is used.
      await writeFile(
        join(directory, 'docker'),
        `#!${process.execPath}
if (process.argv[2] === 'run') {
  process.stdin.resume();
  process.stdin.on('end', () => process.stdout.end(Buffer.from('${output.toString('base64')}', 'base64')));
}
`,
        { mode: 0o700 },
      );
      process.env.PATH = directory;
      const coordinator = new Coordinator(directory);
      const input = {
        id: 'malformed-output',
        sourceCode: 'export const VisualComposition=()=>null;',
        props: {},
        settings: { width: 640, height: 360, fps: 30, durationFrames: 30 },
        assets: [],
        outputs: [{ format: 'png', frame: 0 }],
        mode: 'export',
      };
      await coordinator.execute(
        input,
        { id: input.id, status: 'running' },
        new AbortController(),
      );
      const receipt = JSON.parse(
        await readFile(coordinator.manifest(input.id), 'utf8'),
      );
      assert.equal(receipt.status, 'failed');
      assert.equal(receipt.diagnostic, diagnostic);
      if (hasResult) {
        assert.ok(
          (await readFile(coordinator.resultPath(input.id))).length > 4,
        );
      } else {
        assert.notEqual(receipt.diagnostic, 'render_failed');
        await assert.rejects(readFile(coordinator.resultPath(input.id)), {
          code: 'ENOENT',
        });
      }
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      await rm(directory, { recursive: true, force: true });
    }
  });
}
