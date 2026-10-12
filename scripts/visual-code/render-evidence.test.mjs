import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEvidence, validateMedia } from './protocol.mjs';
import {
  analyzeSnapshot,
  attachRenderEvidence,
  fetchedKey,
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
      style.content ?? 'normal',
    ].map(id);
  let backend = 10;
  const selectedSources = { index: [], value: [] };
  const add = (element, parent) => {
    const index = push(
      1,
      element.tag ?? 'DIV',
      parent,
      backend++,
      element.attributes ?? [],
    );
    if (element.currentSource !== undefined) {
      selectedSources.index.push(index);
      selectedSources.value.push(id(element.currentSource));
    }
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
  if (selectedSources.index.length > 0)
    nodes.currentSourceURL = selectedSources;
  const documents = [{ nodes, layout }];
  for (let at = 0; at < extraDocuments; at++) documents.push({ nodes, layout });
  return { documents, strings };
}

const ORIGIN = 'http://localhost:3000';
const LOGO_URL = `${ORIGIN}/public/assets/logo`;
const fetched = (...urls) => new Set(urls.map(fetchedKey));
const view = {
  assetHashes: new Map([['logo', LOGO_HASH]]),
  width: 320,
  height: 256,
  origin: ORIGIN,
  loaded: fetched(LOGO_URL),
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
  const asset = { kind: 'asset', assetId: 'logo', contentHash: LOGO_HASH };
  const proxy = `${ORIGIN}/proxy?src=${encodeURIComponent(LOGO_URL)}&time=1`;
  const loaded = fetched(LOGO_URL, proxy, `${ORIGIN}/public/assets/missing`);
  assert.deepEqual(resolveSource(LOGO_URL, hashes, ORIGIN, loaded), asset);
  assert.deepEqual(
    resolveSource(`${LOGO_URL}#fragment`, hashes, ORIGIN, loaded),
    asset,
    'a fragment is not part of what was fetched',
  );
  assert.deepEqual(
    resolveSource('/public/assets/logo', hashes, ORIGIN, loaded),
    asset,
    'a relative URL is served by the page itself',
  );
  assert.deepEqual(
    resolveSource(proxy, hashes, ORIGIN, loaded),
    asset,
    'the proxy route reads the staged file',
  );
  assert.deepEqual(
    resolveSource(`${ORIGIN}/public/assets/missing`, hashes, ORIGIN, loaded),
    { kind: 'asset', assetId: 'missing', contentHash: null },
  );
  assert.deepEqual(
    resolveSource(
      `data:image/png;base64,${SMALL_PNG.toString('base64')}`,
      hashes,
      ORIGIN,
      loaded,
    ),
    { kind: 'embedded', assetId: null, contentHash: LOGO_HASH },
  );
  assert.equal(
    resolveSource('https://example.com/a.png', hashes, ORIGIN, loaded).kind,
    'external',
  );
  assert.equal(resolveSource(null, hashes, ORIGIN, loaded).kind, 'unknown');
});

test('a URL that names a staged asset but was never fetched proves nothing', () => {
  const hashes = new Map([['logo', LOGO_HASH]]);
  assert.equal(
    resolveSource(LOGO_URL, hashes, ORIGIN, fetched()).kind,
    'external',
    'a broken image box still has bounds',
  );
});

test('a foreign or non-http URL cannot borrow a staged asset by naming its path', () => {
  const hashes = new Map([['logo', LOGO_HASH]]);
  const forgeries = [
    'https://example.com/assets/logo',
    'http://localhost:9999/public/assets/logo',
    `https://example.com/proxy?src=${encodeURIComponent(LOGO_URL)}`,
    `${ORIGIN}/proxy?src=${encodeURIComponent('https://example.com/assets/logo')}`,
    '//example.com/assets/logo',
    'http://127.0.0.1:9/x?src=/assets/logo',
    'blob:http://localhost:3000/assets/logo',
    'file:///assets/logo',
    `${ORIGIN}/index.html?src=${encodeURIComponent(LOGO_URL)}`,
    `${ORIGIN}/bundle.js?src=${encodeURIComponent(LOGO_URL)}`,
  ];
  // Even if the browser reports a response for every one of them.
  const loaded = fetched(
    LOGO_URL,
    ...forgeries.filter((u) => /^https?:/.test(u)),
  );
  for (const forged of forgeries)
    assert.equal(
      resolveSource(forged, hashes, ORIGIN, loaded).kind,
      'external',
      forged,
    );
  assert.equal(
    resolveSource(LOGO_URL, hashes, null, loaded).kind,
    'external',
    'without a known page origin nothing is trusted',
  );
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

const placed = (elements, loaded = view.loaded) =>
  analyzeSnapshot(snapshotOf(elements), { ...view, loaded }).placedAssets;
const LOGO_ATTRIBUTE = ['src', LOGO_URL];
const OTHER_URL = `${ORIGIN}/public/assets/other`;

test('never credits a canvas with the asset its src attribute names', () => {
  const [canvas] = placed([{ tag: 'CANVAS', attributes: [LOGO_ATTRIBUTE] }]);
  assert.equal(canvas.role, 'image');
  assert.equal(canvas.sourceKind, 'unknown');
  assert.equal(canvas.assetId, null);
  assert.equal(canvas.contentHash, null);
});

test('credits an img with the selected candidate, not its src attribute', () => {
  const loaded = fetched(LOGO_URL);
  const attributes = [LOGO_ATTRIBUTE, ['srcset', `${OTHER_URL} 2x`]];
  // The browser painted OTHER_URL, which was never fetched: nothing is proven.
  const [painted] = placed(
    [{ tag: 'IMG', attributes, currentSource: OTHER_URL }],
    loaded,
  );
  assert.equal(painted.sourceKind, 'external');
  assert.equal(painted.assetId, null);
  // With no selected candidate reported, the painted file cannot be named.
  assert.equal(
    placed([{ tag: 'IMG', attributes }], loaded)[0].sourceKind,
    'unknown',
  );
  // When the selected candidate is the fetched staged asset it is credited.
  const [credited] = placed(
    [{ tag: 'IMG', attributes, currentSource: LOGO_URL }],
    loaded,
  );
  assert.equal(credited.assetId, 'logo');
  assert.equal(credited.contentHash, LOGO_HASH);
});

test('does not trust the src of an img inside a picture', () => {
  const [image] = placed(
    [
      {
        tag: 'PICTURE',
        children: [{ tag: 'IMG', attributes: [LOGO_ATTRIBUTE] }],
      },
    ],
    fetched(LOGO_URL),
  );
  assert.equal(image.sourceKind, 'unknown');
});

test('does not credit media that CSS content or a poster may replace', () => {
  const styled = placed([
    {
      tag: 'IMG',
      attributes: [LOGO_ATTRIBUTE],
      style: { content: `url("${OTHER_URL}")` },
    },
  ]);
  assert.equal(styled[0].sourceKind, 'unknown');
  const video = placed([
    { tag: 'VIDEO', attributes: [LOGO_ATTRIBUTE, ['poster', OTHER_URL]] },
    { tag: 'VIDEO', attributes: [] },
  ]);
  assert.deepEqual(
    video.map((entry) => [entry.role, entry.sourceKind]),
    [
      ['video', 'unknown'],
      ['video', 'unknown'],
    ],
  );
  assert.equal(
    placed([{ tag: 'VIDEO', attributes: [LOGO_ATTRIBUTE] }])[0].assetId,
    'logo',
  );
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
  return {
    _client: () => client,
    url: () => `${ORIGIN}/index.html`,
    handlers,
    client,
  };
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
  page.handlers.get('Network.requestWillBeSent')({
    requestId: 'r1',
    request: { url: `${ORIGIN}/public/assets/f` },
    type: 'Font',
  });
  page.handlers.get('Network.responseReceived')({
    type: 'Font',
    response: { url: `${ORIGIN}/public/assets/f`, status: 200 },
  });
  page.handlers.get('Network.responseReceived')({
    type: 'Font',
    response: { url: `${ORIGIN}/public/assets/never`, status: 404 },
  });
  // A script's fetch() of a staged file proves nothing was painted from it.
  page.handlers.get('Network.responseReceived')({
    type: 'Fetch',
    response: { url: `${ORIGIN}/public/assets/scripted`, status: 200 },
  });
  page.handlers.get('CSS.fontsUpdated')({
    font: {
      fontFamily: 'Brand',
      fontStyle: 'normal',
      fontWeight: '400',
      src: `${ORIGIN}/public/assets/f`,
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
    order.indexOf('Emulation.setScriptExecutionDisabled') <
      order.indexOf('DOMSnapshot.captureSnapshot'),
    'the page is frozen before it is observed',
  );
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
  const shots = [];
  await run.captureAround(
    async (method) => {
      if (method === 'DOMSnapshot.captureSnapshot')
        throw new Error('protocol closed');
      return { value: {} };
    },
    async () => shots.push('shot'),
  );
  const result = run.result();
  assert.deepEqual(shots, ['shot'], 'the export is never blocked');
  assert.deepEqual(result.captures, []);
  assert.deepEqual(result.diagnostics.sort(), [
    'evidence_capture_failed',
    'evidence_frames_missing',
  ]);
});

function frozenRun() {
  const run = new RenderEvidenceRun({
    frames: [0],
    frameCount: 1,
    width: 320,
    height: 256,
    assetHashes: new Map(),
  });
  run.recordFrameRequest(setFrame(0));
  return run;
}

test('freezes the page across the observation and the screenshot, then releases it', async () => {
  const run = frozenRun();
  const order = [];
  const send = async (method, params) => {
    order.push(
      method === 'Emulation.setScriptExecutionDisabled'
        ? `scripts:${params.value ? 'off' : 'on'}`
        : method === 'Animation.setPlaybackRate'
          ? `animations:${params.playbackRate}`
          : method,
    );
    if (method === 'DOMSnapshot.captureSnapshot')
      return { value: snapshotOf([{ text: 'Hello' }]) };
    if (method === 'DOM.pushNodesByBackendIdsToFrontend')
      return { value: { nodeIds: params.backendNodeIds } };
    return { value: {} };
  };
  const result = await run.captureAround(send, async () => {
    order.push('screenshot');
    return 'pixels';
  });
  assert.equal(result, 'pixels');
  const at = (entry) => order.indexOf(entry);
  assert.ok(at('scripts:off') < at('DOMSnapshot.captureSnapshot'));
  assert.ok(at('animations:0') < at('DOMSnapshot.captureSnapshot'));
  assert.ok(at('DOMSnapshot.captureSnapshot') < at('screenshot'));
  assert.ok(at('screenshot') < at('scripts:on'));
  assert.ok(at('screenshot') < at('animations:1'));
  assert.equal(order.at(-1), 'scripts:on');
  assert.equal(run.result().captures.length, 1);
});

test('releases the page even when the screenshot fails', async () => {
  const run = frozenRun();
  const order = [];
  await assert.rejects(
    run.captureAround(
      async (method, params) => {
        if (method === 'Emulation.setScriptExecutionDisabled')
          order.push(params.value ? 'off' : 'on');
        if (method === 'DOMSnapshot.captureSnapshot')
          return { value: snapshotOf([{ text: 'Hello' }]) };
        if (method === 'DOM.pushNodesByBackendIdsToFrontend')
          return { value: { nodeIds: params.backendNodeIds } };
        return { value: {} };
      },
      async () => {
        throw new Error('capture failed');
      },
    ),
    /capture failed/,
  );
  assert.deepEqual(order, ['off', 'on']);
});

test('observes nothing it could not freeze, but still takes the screenshot', async () => {
  const run = frozenRun();
  const seen = [];
  const result = await run.captureAround(
    async (method) => {
      seen.push(method);
      if (method === 'Emulation.setScriptExecutionDisabled')
        throw new Error('unsupported');
      return { value: {} };
    },
    async () => 'pixels',
  );
  assert.equal(result, 'pixels');
  assert.equal(seen.includes('DOMSnapshot.captureSnapshot'), false);
  const evidence = run.result();
  assert.deepEqual(evidence.captures, []);
  assert.ok(evidence.diagnostics.includes('evidence_freeze_failed'));
});

test('does not freeze or observe a frame that was not asked for', async () => {
  const run = frozenRun();
  run.recordFrameRequest(setFrame(7));
  const seen = [];
  const result = await run.captureAround(
    async (method) => {
      seen.push(method);
      return { value: {} };
    },
    async () => 'pixels',
  );
  assert.equal(result, 'pixels');
  assert.deepEqual(seen, []);
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
  await run.captureAround(
    async (method, params) => {
      if (method === 'CSS.getPlatformFontsForNode')
        throw new Error('no layout');
      if (method === 'DOMSnapshot.captureSnapshot')
        return { value: snapshotOf([{ text: 'Hello' }]) };
      if (method === 'DOM.pushNodesByBackendIdsToFrontend')
        return { value: { nodeIds: params.backendNodeIds } };
      return { value: {} };
    },
    async () => 'pixels',
  );
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
