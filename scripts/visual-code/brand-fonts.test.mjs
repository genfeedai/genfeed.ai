import assert from 'node:assert/strict';
import test from 'node:test';
import { collectBrandFontFaces, rootSource } from './brand-fonts.mjs';

const settings = { width: 320, height: 256, fps: 24, durationFrames: 6 };
const font = (id, mime, faces) => ({ id, mime, bytes: 'AAAA', faces });

test('collects a face for every family a font file owns, in the CSS format of its type', () => {
  const faces = collectBrandFontFaces([
    { id: 'logo', mime: 'image/png', bytes: 'AAAA' },
    font('brand-woff2', 'font/woff2', [
      { family: 'Brand Display', weight: 700, style: 'normal' },
      { family: 'Brand Display', weight: 700, style: 'italic' },
    ]),
    font('brand-woff', 'font/woff', [
      { family: 'Brand Text', weight: 400, style: 'normal' },
    ]),
    font('brand-ttf', 'font/ttf', [
      { family: 'Brand Mono', weight: 400, style: 'normal' },
    ]),
    font('brand-otf', 'font/otf', [
      { family: 'Brand Serif', weight: 300, style: 'oblique' },
    ]),
    { id: 'owned-only', mime: 'font/woff2', bytes: 'AAAA' },
  ]);
  assert.deepEqual(
    faces.map((face) => [face.id, face.format, face.style]),
    [
      ['brand-woff2', 'woff2', 'normal'],
      ['brand-woff2', 'woff2', 'italic'],
      ['brand-woff', 'woff', 'normal'],
      ['brand-ttf', 'truetype', 'normal'],
      ['brand-otf', 'opentype', 'oblique'],
    ],
  );
});

test('a render without brand fonts registers the composition unchanged', () => {
  const source = rootSource({ settings, props: { a: 1 }, faces: [] });
  assert.match(source, /component=\{VisualComposition\}/);
  assert.doesNotMatch(source, /WithBrandFonts|@font-face|delayRender/);
});

test('brand fonts are declared from the staged file and awaited before the frame', () => {
  const faces = collectBrandFontFaces([
    font('asset-a1', 'font/woff2', [
      { family: 'Brand Display', weight: 700, style: 'italic' },
    ]),
  ]);
  const source = rootSource({ settings, props: {}, faces });
  assert.match(source, /component=\{WithBrandFonts\}/);
  assert.match(source, /staticFile\('assets\/' \+ face\.id\)/);
  assert.match(source, /delayRender\('brand-fonts'\)/);
  assert.match(source, /document\.fonts\.load/);
  assert.match(source, /continueRender\(handle\)/);
  // The faces are data in the module, so a family can never become code.
  const embedded = /const brandFontFaces = (\[.*\]);/.exec(source)?.[1];
  assert.deepEqual(JSON.parse(embedded), faces);
  assert.match(
    source,
    /width=\{320\} height=\{256\} fps=\{24\} durationInFrames=\{6\}/,
  );
});
