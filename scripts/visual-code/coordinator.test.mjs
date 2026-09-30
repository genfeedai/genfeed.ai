import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
