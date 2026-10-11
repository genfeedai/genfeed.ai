import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertEvidenceObservations,
  EVIDENCE_FONT_PATH,
  EVIDENCE_PNG,
  evidenceInput,
} from './render-evidence.fixture.mjs';
import { sha256Prefixed } from './render-evidence.mjs';

// Drives the real renderer entrypoint against a real Chromium. The unit suite
// cannot prove that the font engine reports what it rendered, so this runs only
// where a browser and the pinned Remotion install exist:
//   VISUAL_CODE_EVIDENCE_BROWSER=/path/to/chrome node --test scripts/visual-code/render-evidence.browser.test.mjs
// The container acceptance (isolation-acceptance.mjs) covers the same cases in
// the real runsc image.
const browser = process.env.VISUAL_CODE_EVIDENCE_BROWSER;
const here = dirname(fileURLToPath(import.meta.url));

async function render(outputs) {
  const { renderVisualComposition } = await import('./render.mjs');
  const root = await mkdtemp(join(tmpdir(), 'visual-evidence-'));
  try {
    return await renderVisualComposition(await evidenceInput(outputs), {
      root,
      runtimeModules: resolve(here, 'node_modules'),
      browserExecutable: browser,
      log: () => {},
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('a still records the fonts the engine actually rendered', {
  skip: !browser,
  timeout: 240_000,
}, async () => {
  const [media] = await render([{ format: 'png', frame: 2 }]);
  assertEvidenceObservations(assert, media.evidence, {
    frame: 2,
    fontHash: sha256Prefixed(await readFile(EVIDENCE_FONT_PATH)),
    pngHash: sha256Prefixed(EVIDENCE_PNG),
  });
});

test('a video samples frames and keeps them identified', {
  skip: !browser,
  timeout: 240_000,
}, async () => {
  const [media] = await render([{ format: 'mp4' }]);
  assert.deepEqual(
    media.evidence.captures.map((capture) => capture.frame),
    [0, 2, 5],
  );
  assert.equal(media.evidence.frameCount, 6);
  assert.deepEqual(media.evidence.diagnostics, []);
});
