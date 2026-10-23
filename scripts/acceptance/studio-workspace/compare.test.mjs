import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { compareEvidence, renderCounterScript } from './compare.mjs';

function evidence() {
  return {
    browser: 'Brave fixture 1',
    fixture: 'workspace-split-v1',
    sourceHead: 'a'.repeat(40),
    viewport: { width: 375, height: 1000 },
    screenshots: {
      idle: 'a'.repeat(64),
      pending: 'b'.repeat(64),
      complete: 'c'.repeat(64),
    },
    renders: {
      StudioPlaygroundWorkspace: 4,
      StudioPlaygroundComposer: 3,
      StudioPlaygroundResults: 3,
    },
    blockedRequests: [],
    generationRequests: 1,
    counterErrors: [],
  };
}

test('accepts identical pixels and fewer committed renders on a changed head', () => {
  const before = evidence();
  const after = structuredClone(before);
  after.sourceHead = 'b'.repeat(40);
  after.renders.StudioPlaygroundWorkspace--;
  assert.deepEqual(compareEvidence(before, after), []);
});

test('rejects changed pixels, worse renders, missing captures and unobserved components', () => {
  const before = evidence();
  const after = structuredClone(before);
  after.screenshots.idle = 'd'.repeat(64);
  delete after.screenshots.pending;
  after.renders.StudioPlaygroundWorkspace++;
  after.renders.StudioPlaygroundComposer = 0;
  assert.deepEqual(compareEvidence(before, after), [
    'idle pixels differ',
    'pending capture missing',
    'StudioPlaygroundWorkspace renders increased: 4 -> 5',
    'StudioPlaygroundComposer render counter missing or empty',
  ]);
});

test('rejects incomparable environments, extra generation requests and blocked traffic', () => {
  const before = evidence();
  const after = structuredClone(before);
  after.browser = 'Other browser';
  after.viewport.width = 1440;
  after.generationRequests = 2;
  after.blockedRequests.push('POST https://example.invalid');
  after.counterErrors.push('fiber failure');
  assert.deepEqual(compareEvidence(before, after), [
    'browser differs',
    'viewport differs',
    'after: generation request count is not one',
    'after: blocked requests recorded',
    'after: render counter errors recorded',
  ]);
});

test('rejects an incomplete or empty baseline instead of reporting parity', () => {
  const before = evidence();
  before.renders.StudioPlaygroundResults = 0;
  before.sourceHead = '';
  assert.deepEqual(compareEvidence(before, evidence()), [
    'before: source head missing',
    'StudioPlaygroundResults render counter missing or empty',
  ]);
});

test('counts only committed renders of the observed components and supports reset', () => {
  const window = {};
  runInNewContext(renderCounterScript, { window });
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  assert.equal(hook.supportsFiber, true);
  assert.equal(hook.inject({ version: 'fixture' }), 1);
  const root = {
    current: {
      type: null,
      flags: 0,
      child: {
        type: { name: 'StudioPlaygroundWorkspace' },
        flags: 1,
        child: {
          type: { name: 'StudioPlaygroundComposer' },
          flags: 0,
          child: null,
          sibling: {
            type: { name: 'StudioPlaygroundResults' },
            flags: 1,
            child: null,
            sibling: null,
          },
        },
        sibling: null,
      },
      sibling: null,
    },
  };
  hook.onCommitFiberRoot(1, root);
  assert.deepEqual(
    JSON.parse(JSON.stringify(window.__studioSplitCounter.read())),
    {
      renders: {
        StudioPlaygroundWorkspace: 1,
        StudioPlaygroundComposer: 0,
        StudioPlaygroundResults: 1,
      },
      errors: [],
      rendererCount: 1,
    },
  );
  window.__studioSplitCounter.reset();
  assert.equal(
    window.__studioSplitCounter.read().renders.StudioPlaygroundWorkspace,
    0,
  );
});

test('rejects missing browser, fixture and viewport metadata', () => {
  const before = evidence();
  before.browser = '';
  before.fixture = '';
  before.viewport.height = 0;
  const failures = compareEvidence(before, before);
  assert.ok(failures.includes('before: browser missing'));
  assert.ok(failures.includes('after: fixture missing or unsupported'));
  assert.ok(failures.includes('after: viewport missing or unsupported'));
});

test('CLI requires actual PNG files whose bytes match both receipts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workspace-compare-'));
  const before = path.join(root, 'before');
  const after = path.join(root, 'after');
  const cli = fileURLToPath(new URL('./compare.mjs', import.meta.url));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
    'base64',
  );
  const hash = createHash('sha256').update(png).digest('hex');
  try {
    for (const directory of [before, after]) {
      await mkdir(directory);
      for (const width of [375, 1440]) {
        const receipt = evidence();
        receipt.viewport.width = width;
        for (const state of ['idle', 'pending', 'complete']) {
          receipt.screenshots[state] = hash;
          await writeFile(
            path.join(directory, `workspace-${width}-${state}.png`),
            png,
          );
        }
        await writeFile(
          path.join(directory, `workspace-${width}.json`),
          JSON.stringify(receipt),
        );
      }
    }
    assert.match(
      execFileSync(process.execPath, [cli, before, after], {
        encoding: 'utf8',
      }),
      /pixels identical/,
    );
    await writeFile(
      path.join(after, 'workspace-375-idle.png'),
      Buffer.concat([png, Buffer.from('changed')]),
    );
    const changed = spawnSync(process.execPath, [cli, before, after], {
      encoding: 'utf8',
    });
    assert.equal(changed.status, 1);
    assert.match(changed.stderr, /bytes do not match receipt hash/);
    await rm(path.join(after, 'workspace-375-idle.png'));
    assert.equal(spawnSync(process.execPath, [cli, before, after]).status, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
