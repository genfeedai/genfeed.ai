import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEvidence, validateMedia } from './protocol.mjs';
import {
  analyzeSnapshot,
  attachRenderEvidence,
  framesToInspect,
  parseCssColor,
  RenderEvidenceRun,
  resolveSource,
  sha256Prefixed,
} from './render-evidence.mjs';

const SMALL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==',
  'base64',
);
const LOGO_HASH = sha256Prefixed(SMALL_PNG);

// Builds a DOMSnapshot.captureSnapshot response from plain descriptions so the
// analysis can be checked without a browser.
function snapshotOf(elements, { extraDocuments = 0 } = {}) {
  const strings = [];
  const id = (value) => {
    if (value === null) return -1;
    const at = strings.indexOf(value);
    if (at >= 0) return at;
    strings.push(value);
    return strings.length - 1;
  };
  const nodes = {
    parentIndex: [-1],
    nodeType: [9],
    nodeName: [id('#document')],
    backendNodeId: [1],
    attributes: [[]],
  };
  const layout = {
    nodeIndex: [0],
    styles: [[]],
    bounds: [[0, 0, 320, 256]],
    text: [-1],
  };
  const push = (type, name, parent, backendNodeId, attributes) => {
    nodes.parentIndex.push(parent);
    nodes.nodeType.push(type);
    nodes.nodeName.push(id(name));
    nodes.backendNodeId.push(backendNodeId);
    nodes.attributes.push(attributes.flatMap(([k, v]) => [id(k), id(v)]));
    return nodes.nodeType.length - 1;
  };
  const styles = (style) =>
    [
      style.family ?? 'sans-serif',
      style.size ?? '20px',
      style.weight ?? '400',
      style.fontStyle ?? 'normal',
      style.color ?? 'rgb(255, 255, 255)',
      style.opacity ?? '1',
      style.visibility ?? 'visible',
      style.transform ?? 'none',
      style.background ?? 'none',
    ].map(id);
  let backend = 10;
  const add = (element, parent) => {
    const index = push(
      1,
      element.tag ?? 'DIV',
      parent,
      backend++,
      element.attributes ?? [],
    );
    layout.nodeIndex.push(index);
    layout.styles.push(styles(element.style ?? {}));
    layout.bounds.push(element.bounds ?? [0, 0, 100, 40]);
    layout.text.push(-1);
    if (element.text !== undefined) {
      const text = push(3, '#text', index, backend++, []);
      layout.nodeIndex.push(text);
      layout.styles.push(styles(element.style ?? {}));
      layout.bounds.push(
        element.textBounds ?? element.bounds ?? [0, 0, 100, 40],
      );
      layout.text.push(id(element.text));
    }
    for (const child of element.children ?? []) add(child, index);
  };
  for (const element of elements) add(element, 0);
  const documents = [{ nodes, layout }];
  for (let at = 0; at < extraDocuments; at++) documents.push({ nodes, layout });
  return { documents, strings };
}

const view = {
  assetHashes: new Map([['logo', LOGO_HASH]]),
  width: 320,
  height: 256,
};

test('parses computed colours into RRGGBBAA', () => {
  assert.equal(parseCssColor('rgb(255, 204, 0)'), '#FFCC00FF');
  assert.equal(parseCssColor('rgba(255, 255, 255, 0.5)'), '#FFFFFF80');
  assert.equal(parseCssColor('rgb(0 0 0 / 25%)'), '#00000040');
  assert.equal(parseCssColor('color(display-p3 1 0 0)'), null);
  assert.equal(parseCssColor('rgb(300, 0, 0)'), null);
});

test('resolves staged assets, proxies, embedded data and externals', () => {
  const hashes = new Map([['logo', LOGO_HASH]]);
  assert.deepEqual(
    resolveSource('http://localhost:3000/public/assets/logo', hashes),
    { kind: 'asset', assetId: 'logo', contentHash: LOGO_HASH },
  );
  assert.deepEqual(
    resolveSource(
      `http://localhost:3000/proxy?src=${encodeURIComponent('http://localhost:3000/public/assets/logo')}&time=1`,
      hashes,
    ),
    { kind: 'asset', assetId: 'logo', contentHash: LOGO_HASH },
  );
  assert.deepEqual(
    resolveSource('http://localhost:3000/public/assets/missing', hashes),
    { kind: 'asset', assetId: 'missing', contentHash: null },
  );
  assert.deepEqual(
    resolveSource(
      `data:image/png;base64,${SMALL_PNG.toString('base64')}`,
      hashes,
    ),
    { kind: 'embedded', assetId: null, contentHash: LOGO_HASH },
  );
  assert.equal(
    resolveSource('https://example.com/a.png', hashes).kind,
    'external',
  );
  assert.equal(resolveSource(null, hashes).kind, 'unknown');
});

test('reports visible text layers and placed assets with resolved style', () => {
  const analysis = analyzeSnapshot(
    snapshotOf([
      {
        text: 'Hello',
        bounds: [10, 20, 200, 40],
        style: {
          family: 'Inter, sans-serif',
          size: '44px',
          weight: '700',
          color: 'rgb(255, 204, 0)',
        },
      },
      {
        tag: 'IMG',
        attributes: [['src', 'http://localhost:3000/public/assets/logo']],
        bounds: [150, 170, 60, 40],
        style: { opacity: '0.5', transform: 'matrix(1, 0, 0, 1, 0, 0)' },
      },
    ]),
    view,
  );
  assert.equal(analysis.textLayers.length, 1);
  const [layer] = analysis.textLayers;
  assert.equal(layer.text, 'Hello');
  assert.deepEqual(layer.bounds, { x: 10, y: 20, width: 200, height: 40 });
  assert.equal(layer.fontFamily, 'Inter, sans-serif');
  assert.equal(layer.fontSizePx, 44);
  assert.equal(layer.fontWeight, '700');
  assert.deepEqual(layer.color, { css: 'rgb(255, 204, 0)', hex: '#FFCC00FF' });
  assert.equal(layer.platformFonts, null);
  assert.deepEqual(analysis.placedAssets, [
    {
      role: 'image',
      sourceKind: 'asset',
      assetId: 'logo',
      contentHash: LOGO_HASH,
      bounds: { x: 150, y: 170, width: 60, height: 40 },
      transform: 'matrix(1, 0, 0, 1, 0, 0)',
      opacity: 0.5,
    },
  ]);
});

test('leaves out text a viewer cannot see', () => {
  const analysis = analyzeSnapshot(
    snapshotOf([
      { text: 'transparent', style: { opacity: '0' } },
      { text: 'hidden', style: { visibility: 'hidden' } },
      { text: 'off canvas', bounds: [400, 20, 100, 40] },
      {
        text: 'inside faded parent',
        children: [{ text: 'child of faded', style: { opacity: '1' } }],
        style: { opacity: '0' },
      },
      { text: '   ' },
      { text: 'shown' },
    ]),
    view,
  );
  assert.deepEqual(
    analysis.textLayers.map((layer) => layer.text),
    ['shown'],
  );
});

test('multiplies ancestor opacity into a layer', () => {
  const analysis = analyzeSnapshot(
    snapshotOf([
      {
        style: { opacity: '0.5' },
        children: [{ text: 'dim', style: { opacity: '0.5' } }],
      },
    ]),
    view,
  );
  assert.equal(analysis.textLayers[0].opacity, 0.25);
});

test('flags what it could not inspect', () => {
  const nested = analyzeSnapshot(
    snapshotOf([{ text: 'a' }], { extraDocuments: 1 }),
    view,
  );
  assert.ok(nested.diagnostics.includes('nested_documents_not_inspected'));
  const many = analyzeSnapshot(
    snapshotOf(Array.from({ length: 300 }, (_, i) => ({ text: `t${i}` }))),
    view,
  );
  assert.equal(many.textLayers.length, 256);
  assert.ok(many.diagnostics.includes('text_layers_truncated'));
  assert.equal(
    analyzeSnapshot({ documents: [], strings: [] }, view).diagnostics[0],
    'snapshot_empty',
  );
});

test('inspects one still frame or three sampled video frames', () => {
  assert.deepEqual(framesToInspect({ format: 'png', frame: 7 }, 30), [7]);
  assert.deepEqual(framesToInspect({ format: 'mp4' }, 30), [0, 14, 29]);
  assert.deepEqual(framesToInspect({ format: 'mp4' }, 1), [0]);
  assert.deepEqual(framesToInspect({ format: 'mp4' }, 2), [0, 1]);
});

function fakePage(calls) {
  const handlers = new Map();
  const client = {
    async send(method, params) {
      calls.push({ method, params });
      switch (method) {
        case 'Browser.getVersion':
          return {
            value: { product: 'HeadlessChrome/1.2.3', revision: '@abc' },
          };
        case 'DOMSnapshot.captureSnapshot':
          return {
            value: snapshotOf([
              { text: 'Hello', style: { family: 'Inter, sans-serif' } },
            ]),
          };
        case 'DOM.pushNodesByBackendIdsToFrontend':
          return {
            value: {
              nodeIds: params.backendNodeIds.map((value) => value + 100),
            },
          };
        case 'CSS.getPlatformFontsForNode':
          return {
            value: {
              fonts: [
                {
                  familyName: 'DejaVu Sans',
                  postScriptName: 'DejaVuSans',
                  isCustomFont: false,
                  glyphCount: 5,
                },
              ],
            },
          };
        default:
          return { value: {} };
      }
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
  };
  return { _client: () => client, handlers, client };
}

function setFrame(frame) {
  return {
    functionDeclaration: '(f, c, a) => { window.remotion_setFrame(f, c, a); }',
    arguments: [{ value: frame }, { value: 'VisualComposition' }, { value: 0 }],
  };
}

test('captures at the screenshot of a requested frame and passes calls through', async () => {
  const calls = [];
  const pages = [];
  const browser = {
    async newPage() {
      const page = fakePage(calls);
      pages.push(page);
      return page;
    },
  };
  const evidence = attachRenderEvidence(browser, {
    assetHashes: new Map(),
    width: 320,
    height: 256,
  });

  await browser.newPage();
  assert.equal(
    pages[0].handlers.size,
    0,
    'pages outside an output are not hooked',
  );

  evidence.begin({ format: 'png', frame: 4 }, { durationFrames: 30 });
  const page = await browser.newPage();
  page.handlers.get('CSS.fontsUpdated')({
    font: {
      fontFamily: 'Brand',
      fontStyle: 'normal',
      fontWeight: '400',
      src: 'http://x/public/assets/f',
      platformFontFamily: 'Brand Sans',
    },
  });
  page.handlers.get('CSS.fontsUpdated')({});
  const client = page._client();
  await client.send('Runtime.callFunctionOn', setFrame(3));
  await client.send('Page.captureScreenshot', { format: 'png' });
  assert.equal(
    calls.filter((c) => c.method === 'DOMSnapshot.captureSnapshot').length,
    0,
    'wrong frame is not inspected',
  );
  await client.send('Runtime.callFunctionOn', setFrame(4));
  const response = await client.send('Page.captureScreenshot', {
    format: 'png',
  });
  await client.send('Page.captureScreenshot', { format: 'png' });
  assert.deepEqual(
    response,
    { value: {} },
    'the original screenshot call still runs',
  );
  assert.equal(
    calls.filter((c) => c.method === 'DOMSnapshot.captureSnapshot').length,
    1,
    'a frame is inspected once',
  );
  const order = calls.map((c) => c.method);
  assert.ok(
    order.indexOf('DOMSnapshot.captureSnapshot') <
      order.lastIndexOf('Page.captureScreenshot'),
  );

  const result = evidence.end();
  assert.deepEqual(result.browser, {
    product: 'HeadlessChrome/1.2.3',
    revision: '@abc',
  });
  assert.equal(result.frameCount, 30);
  assert.equal(result.captures.length, 1);
  assert.equal(result.captures[0].frame, 4);
  assert.deepEqual(result.captures[0].textLayers[0].platformFonts, [
    {
      familyName: 'DejaVu Sans',
      postScriptName: 'DejaVuSans',
      isCustomFont: false,
      glyphCount: 5,
    },
  ]);
  assert.equal('backendNodeId' in result.captures[0].textLayers[0], false);
  assert.equal(result.fontFaces.length, 1);
  assert.deepEqual(result.fontFaces[0].source, {
    kind: 'asset',
    assetId: 'f',
    contentHash: null,
  });
  assert.deepEqual(result.diagnostics, []);
  assert.doesNotThrow(() => validateEvidence(result));
});

test('a failed or missing capture is a diagnostic, never an exception', async () => {
  const run = new RenderEvidenceRun({
    frames: [0, 1],
    frameCount: 2,
    width: 320,
    height: 256,
    assetHashes: new Map(),
  });
  run.recordFrameRequest(setFrame(0));
  await run.capture(async () => {
    throw new Error('protocol closed');
  });
  const result = run.result();
  assert.deepEqual(result.captures, []);
  assert.deepEqual(result.diagnostics.sort(), [
    'evidence_capture_failed',
    'evidence_frames_missing',
  ]);
});

test('keeps the font engine failing closed per layer', async () => {
  const run = new RenderEvidenceRun({
    frames: [0],
    frameCount: 1,
    width: 320,
    height: 256,
    assetHashes: new Map(),
  });
  run.recordFrameRequest(setFrame(0));
  await run.capture(async (method, params) => {
    if (method === 'CSS.getPlatformFontsForNode') throw new Error('no layout');
    if (method === 'DOMSnapshot.captureSnapshot')
      return { value: snapshotOf([{ text: 'Hello' }]) };
    if (method === 'DOM.pushNodesByBackendIdsToFrontend')
      return { value: { nodeIds: params.backendNodeIds } };
    return { value: {} };
  });
  assert.equal(run.result().captures[0].textLayers[0].platformFonts, null);
});

function evidenceFor(overrides = {}) {
  return {
    schemaVersion: 1,
    browser: { product: 'HeadlessChrome/1', revision: null },
    frameCount: 1,
    captures: [],
    fontFaces: [],
    assets: [],
    diagnostics: [],
    ...overrides,
  };
}

test('protocol carries closed, bounded evidence on media only', () => {
  const settings = { width: 256, height: 256, fps: 24, durationFrames: 1 };
  const png = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(256, 16);
  png.writeUInt32BE(256, 20);
  const media = (extra) => ({
    format: 'png',
    frame: 0,
    width: 256,
    height: 256,
    bytes: png.toString('base64'),
    ...extra,
  });
  assert.doesNotThrow(() =>
    validateMedia(media({ evidence: evidenceFor() }), settings),
  );
  assert.doesNotThrow(() => validateMedia(media({}), settings));
  assert.throws(
    () =>
      validateMedia(
        media({ evidence: { ...evidenceFor(), extra: 1 } }),
        settings,
      ),
    /unknown_field/,
  );
  assert.throws(
    () =>
      validateMedia(
        media({ evidence: evidenceFor({ schemaVersion: 2 }) }),
        settings,
      ),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      validateMedia(
        media({ evidence: evidenceFor({ diagnostics: ['Not A Code'] }) }),
        settings,
      ),
    /invalid_evidence/,
  );
  assert.throws(
    () =>
      validateEvidence(
        evidenceFor({
          captures: [
            {
              frame: 0,
              textLayers: [{ text: 'x'.repeat(2001) }],
              placedAssets: [],
            },
          ],
        }),
      ),
    /unknown_field|invalid_evidence/,
  );
});
