import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// One composition that exercises every kind of evidence: an owned web font, a
// family that does not exist (the engine must fall back), invisible text, and a
// transformed placed asset. Shared by the host browser test and the container
// acceptance so both prove the same behavior.
const here = dirname(fileURLToPath(import.meta.url));
export const EVIDENCE_FONT_PATH = resolve(
  here,
  '../../packages/fonts/files/Zodiak-Regular.woff2',
);
// 1x1 opaque PNG.
export const EVIDENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==',
  'base64',
);
export const EVIDENCE_COMPOSITION = `
import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
export const VisualComposition = () => (
  <AbsoluteFill style={{background: '#102030'}}>
    <style>{"@font-face{font-family:'ZodiakBrand';src:url('" + staticFile('assets/zodiak-regular') + "') format('woff2');font-weight:400;}"}</style>
    <div style={{position: 'absolute', left: 20, top: 20, fontFamily: 'ZodiakBrand, serif', fontSize: 44, color: '#FFCC00'}}>Brand headline</div>
    <div style={{position: 'absolute', left: 20, top: 120, fontFamily: 'NoSuchBrandFontXyz, sans-serif', fontSize: 30, color: 'rgba(255, 255, 255, 0.5)'}}>Fallback line</div>
    <div style={{position: 'absolute', left: 20, top: 200, opacity: 0, fontSize: 30}}>Never visible</div>
    <Img src={staticFile('assets/logo-png')} style={{position: 'absolute', left: 150, top: 170, width: 60, height: 40, transform: 'rotate(10deg)', opacity: 0.5}} />
  </AbsoluteFill>
);`;
export const EVIDENCE_SETTINGS = {
  width: 320,
  height: 256,
  fps: 24,
  durationFrames: 6,
};

export async function evidenceInput(outputs, id = 'evidence-fixture') {
  return {
    id,
    sourceCode: EVIDENCE_COMPOSITION,
    settings: EVIDENCE_SETTINGS,
    props: {},
    assets: [
      {
        id: 'zodiak-regular',
        mime: 'font/woff2',
        bytes: (await readFile(EVIDENCE_FONT_PATH)).toString('base64'),
      },
      {
        id: 'logo-png',
        mime: 'image/png',
        bytes: EVIDENCE_PNG.toString('base64'),
      },
    ],
    outputs,
    mode: 'export',
  };
}

/**
 * Assertions shared by both runtimes. Font names for the fallback case differ per
 * platform (Arial on macOS, DejaVu in the image), so only the fact of fallback is
 * asserted, never the substitute.
 */
export function assertEvidenceObservations(assert, evidence, expected) {
  const [capture] = evidence.captures;
  assert.equal(capture.frame, expected.frame);

  const headline = capture.textLayers.find((l) => l.text === 'Brand headline');
  assert.ok(headline, `headline layer: ${JSON.stringify(evidence)}`);
  assert.equal(headline.color.hex, '#FFCC00FF');
  assert.equal(headline.fontFamily, 'ZodiakBrand, serif');
  assert.equal(headline.platformFonts.length, 1);
  assert.equal(headline.platformFonts[0].familyName, 'Zodiak');
  assert.equal(headline.platformFonts[0].isCustomFont, true);

  const face = evidence.fontFaces.find((f) => f.family === 'ZodiakBrand');
  assert.deepEqual(face.source, {
    kind: 'asset',
    assetId: 'zodiak-regular',
    contentHash: expected.fontHash,
  });
  assert.equal(face.platformFamily, 'Zodiak');

  const fallback = capture.textLayers.find((l) => l.text === 'Fallback line');
  assert.ok(fallback, 'fallback layer is recorded');
  assert.equal(fallback.color.hex, '#FFFFFF80');
  assert.ok(fallback.platformFonts.length > 0);
  for (const font of fallback.platformFonts) {
    assert.equal(font.isCustomFont, false);
    assert.notEqual(font.familyName, 'NoSuchBrandFontXyz');
  }

  assert.equal(
    capture.textLayers.some((l) => l.text === 'Never visible'),
    false,
    'invisible text is not a layer',
  );

  assert.equal(capture.placedAssets.length, 1);
  const [logo] = capture.placedAssets;
  assert.equal(logo.assetId, 'logo-png');
  assert.equal(logo.contentHash, expected.pngHash);
  assert.equal(logo.opacity, 0.5);
  assert.match(logo.transform, /^matrix\(/);
  assert.deepEqual(evidence.assets.map((a) => a.id).sort(), [
    'logo-png',
    'zodiak-regular',
  ]);
  assert.ok(evidence.browser.product);
  assert.deepEqual(evidence.diagnostics, []);
}
