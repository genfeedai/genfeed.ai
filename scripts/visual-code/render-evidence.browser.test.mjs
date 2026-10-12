import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertBrandFontObservations,
  assertEvidenceObservations,
  brandFontInput,
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

async function render(outputs, input = evidenceInput(outputs)) {
  const { renderVisualComposition } = await import('./render.mjs');
  const root = await mkdtemp(join(tmpdir(), 'visual-evidence-'));
  try {
    return await renderVisualComposition(await input, {
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

test('an OffthreadVideo frame is placed but never attributed to a file it cannot be tied to', {
  skip: !browser,
  timeout: 240_000,
}, async () => {
  const { createFixtureMedia } = await import('./create-fixture-media.mjs');
  const { renderVisualComposition } = await import('./render.mjs');
  const media = await mkdtemp(join(tmpdir(), 'visual-evidence-media-'));
  const root = await mkdtemp(join(tmpdir(), 'visual-evidence-'));
  try {
    await createFixtureMedia(media);
    const clip = await readFile(join(media, 'clip.mp4'));
    const image = await readFile(join(media, 'image.png'));
    const [out] = await renderVisualComposition(
      {
        id: 'evidence-media',
        sourceCode: `import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, staticFile} from 'remotion';
export const VisualComposition = () => (
  <AbsoluteFill>
    <OffthreadVideo src={staticFile('assets/clip')} style={{width: 160, height: 90}} />
    <Img src={staticFile('assets/image')} style={{width: 48, height: 48}} />
  </AbsoluteFill>
);`,
        settings: { width: 320, height: 256, fps: 30, durationFrames: 6 },
        props: {},
        assets: [
          { id: 'clip', mime: 'video/mp4', bytes: clip.toString('base64') },
          { id: 'image', mime: 'image/png', bytes: image.toString('base64') },
        ],
        outputs: [{ format: 'png', frame: 1 }],
        mode: 'export',
      },
      {
        root,
        runtimeModules: resolve(here, 'node_modules'),
        browserExecutable: browser,
        log: () => {},
      },
    );
    // A plain image is traced to its file. An OffthreadVideo frame is a blob: URL
    // built from a proxy response, which the DOM cannot tie to a file, so it is
    // placed but unresolved (never guessed).
    const placed = out.evidence.captures[0].placedAssets;
    assert.equal(placed.length, 2);
    assert.deepEqual(
      placed
        .map((entry) => [entry.assetId, entry.contentHash])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      [
        ['image', sha256Prefixed(image)],
        [null, null],
      ],
    );
  } finally {
    await rm(media, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('a staged brand font is declared by the renderer and attributed to its asset', {
  skip: !browser,
  timeout: 240_000,
}, async () => {
  const [media] = await render(
    [{ format: 'png', frame: 2 }],
    brandFontInput([{ format: 'png', frame: 2 }]),
  );
  assertBrandFontObservations(assert, media.evidence, {
    frame: 2,
    fontHash: sha256Prefixed(await readFile(EVIDENCE_FONT_PATH)),
    platformFamily: 'Zodiak',
  });
});

test('a staged OpenType brand font is used the same way', {
  skip: !browser,
  timeout: 240_000,
}, async () => {
  const path = EVIDENCE_FONT_PATH.replace(/\.woff2$/, '.otf');
  const [media] = await render(
    [{ format: 'png', frame: 1 }],
    brandFontInput([{ format: 'png', frame: 1 }], 'brand-font-otf', {
      mime: 'font/otf',
      path,
    }),
  );
  assertBrandFontObservations(assert, media.evidence, {
    frame: 1,
    fontHash: sha256Prefixed(await readFile(path)),
    platformFamily: 'Zodiak',
  });
});

test('a brand font whose file is unusable shows the fallback the engine used', {
  skip: !browser,
  timeout: 240_000,
}, async () => {
  const input = await brandFontInput([{ format: 'png', frame: 0 }]);
  // Valid signature, but not a font the engine can decode.
  const broken = Buffer.alloc(256, 1);
  broken.write('wOF2', 0, 'ascii');
  input.assets[0].bytes = broken.toString('base64');
  const [media] = await render([{ format: 'png', frame: 0 }], input);
  const [capture] = media.evidence.captures;
  assert.ok(capture.textLayers.length > 0);
  for (const layer of capture.textLayers)
    assert.equal(
      layer.platformFonts.some((font) => font.isCustomFont),
      false,
      'the engine must not claim the brand font drew the text',
    );
});
