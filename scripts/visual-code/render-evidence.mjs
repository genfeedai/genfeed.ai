import { createHash } from 'node:crypto';

// Observes what Chromium really rendered for an export. Everything here is read
// through the DevTools protocol (the font engine, the layout tree), never through
// page JavaScript, because the composition is untrusted and could otherwise
// override getComputedStyle or document.fonts.
export const EVIDENCE_VERSION = 1;
export const EVIDENCE_LIMITS = {
  fontFaces: 64,
  frames: 16,
  placedAssets: 256,
  platformFonts: 16,
  sourceLength: 512,
  textLayers: 256,
  textLength: 2000,
};
const CAPTURE_TIMEOUT_MS = 10_000;
const STYLE_NAMES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'color',
  'opacity',
  'visibility',
  'transform',
  'background-image',
];
const STYLE = Object.fromEntries(
  STYLE_NAMES.map((name, index) => [name, index]),
);
const TEXT_NODE = 3;
const PLACED_TAGS = new Map([
  ['IMG', 'image'],
  ['VIDEO', 'video'],
  ['CANVAS', 'image'],
]);

export function sha256Prefixed(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function clamp(value, limit) {
  return typeof value === 'string' && value.length > limit
    ? value.slice(0, limit)
    : value;
}

function parseUrl(candidate, base) {
  try {
    return new URL(candidate, base);
  } catch {
    return null;
  }
}

const HTTP = new Set(['http:', 'https:']);

function httpUrl(candidate, origin) {
  if (!origin) return null;
  const url = parseUrl(candidate, origin);
  return url !== null && HTTP.has(url.protocol) ? url : null;
}

/** Network events carry no fragment, so the key does not either. */
export function fetchedKey(href) {
  const url = parseUrl(href);
  if (url === null) return null;
  url.hash = '';
  return url.href;
}

// Only the path may name an asset; a query string can carry any text.
function assetId(url) {
  let decoded = url.pathname;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    // Keep the raw path; the pattern below still has to match.
  }
  return /\/assets\/([a-zA-Z0-9_-]{1,200})$/.exec(decoded)?.[1] ?? null;
}

/**
 * Resolve a URL the composition used to the staged asset it was loaded from.
 * A name is not enough: a composition can write any URL, so a staged asset is
 * reported only when the browser actually fetched it from the page's own origin
 * (`loaded` holds the URLs Chromium got a successful response for). Remotion
 * serves staticFile("assets/<id>") from the page origin, and its `/proxy?src=`
 * route reads a staged file the same way. An OffthreadVideo frame is a `blob:`
 * URL built from a proxy response, which the DOM cannot tie back to a file, so it
 * stays unresolved rather than guessed.
 */
export function resolveSource(raw, assetHashes, origin, loaded) {
  if (typeof raw !== 'string' || raw.length === 0)
    return { kind: 'unknown', assetId: null, contentHash: null };
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    if (comma < 0) return { kind: 'unknown', assetId: null, contentHash: null };
    const isBase64 = /;base64$/i.test(raw.slice(0, comma));
    try {
      const body = raw.slice(comma + 1);
      const bytes = isBase64
        ? Buffer.from(body, 'base64')
        : Buffer.from(decodeURIComponent(body), 'utf8');
      return {
        kind: 'embedded',
        assetId: null,
        contentHash: sha256Prefixed(bytes),
      };
    } catch {
      return { kind: 'unknown', assetId: null, contentHash: null };
    }
  }
  const unproven = { kind: 'external', assetId: null, contentHash: null };
  const outer = httpUrl(raw, origin);
  if (outer === null || !loaded.has(fetchedKey(outer.href))) return unproven;
  let id = outer.origin === origin ? assetId(outer) : null;
  if (id === null) {
    const nested = outer.searchParams.get('src');
    // Only Remotion's proxy route reads a file named in `src`; any other page
    // that answered 2xx proves nothing about that file.
    const isProxy = outer.origin === origin && outer.pathname === '/proxy';
    // The proxy is handed the file's absolute URL; a relative one is not Remotion's.
    const inner = nested && isProxy ? parseUrl(nested) : null;
    if (inner !== null && HTTP.has(inner.protocol) && inner.origin === origin)
      id = assetId(inner);
  }
  return id === null
    ? unproven
    : { kind: 'asset', assetId: id, contentHash: assetHashes.get(id) ?? null };
}

export function parseCssColor(value) {
  const match =
    /^rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?%?))?\s*\)$/.exec(
      String(value ?? '').trim(),
    );
  if (!match) return null;
  const channels = match.slice(1, 4).map((part) => Math.round(Number(part)));
  const alphaPart = match[4];
  const alpha =
    alphaPart === undefined
      ? 1
      : alphaPart.endsWith('%')
        ? Number.parseFloat(alphaPart) / 100
        : Number(alphaPart);
  if (
    channels.some((channel) => !Number.isFinite(channel) || channel > 255) ||
    !Number.isFinite(alpha)
  )
    return null;
  const hex = [...channels, Math.round(Math.min(1, Math.max(0, alpha)) * 255)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `#${hex}`;
}

function union(boxes) {
  const left = Math.min(...boxes.map(([x]) => x));
  const top = Math.min(...boxes.map(([, y]) => y));
  const right = Math.max(...boxes.map(([x, , width]) => x + width));
  const bottom = Math.max(...boxes.map(([, y, , height]) => y + height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function isOnCanvas(bounds, width, height) {
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.x < width &&
    bounds.y < height &&
    bounds.x + bounds.width > 0 &&
    bounds.y + bounds.height > 0
  );
}

/**
 * Pure analysis of a DOMSnapshot.captureSnapshot result. Returns visible text
 * layers (one per element that owns rendered text) and placed images, plus the
 * backend node ids needed to ask the font engine which fonts drew each layer.
 */
export function analyzeSnapshot(
  snapshot,
  { assetHashes, width, height, origin, loaded },
) {
  const diagnostics = [];
  const documents = snapshot.documents ?? [];
  if (documents.length === 0) return { diagnostics: ['snapshot_empty'] };
  if (documents.length > 1) diagnostics.push('nested_documents_not_inspected');
  const document = documents[0];
  const string = (index) =>
    Number.isInteger(index) && index >= 0 ? snapshot.strings[index] : null;
  const { layout, nodes } = document;
  const layoutByNode = new Map();
  for (const [layoutIndex, nodeIndex] of layout.nodeIndex.entries())
    layoutByNode.set(nodeIndex, layoutIndex);
  const style = (layoutIndex, name) =>
    string(layout.styles[layoutIndex]?.[STYLE[name]]);
  const opacityOf = (nodeIndex) => {
    let opacity = 1;
    for (let at = nodeIndex; at >= 0; at = nodes.parentIndex[at]) {
      const layoutIndex = layoutByNode.get(at);
      if (layoutIndex === undefined) continue;
      const raw = style(layoutIndex, 'opacity');
      const value = raw === null ? Number.NaN : Number(raw);
      if (Number.isFinite(value)) opacity *= value;
    }
    return opacity;
  };
  const attribute = (nodeIndex, name) => {
    const pairs = nodes.attributes?.[nodeIndex] ?? [];
    for (let at = 0; at + 1 < pairs.length; at += 2)
      if (string(pairs[at]) === name) return string(pairs[at + 1]);
    return null;
  };

  const groups = new Map();
  layout.nodeIndex.forEach((nodeIndex, layoutIndex) => {
    if (nodes.nodeType[nodeIndex] !== TEXT_NODE) return;
    const text = string(layout.text[layoutIndex]);
    if (!text || text.trim() === '') return;
    const parent = nodes.parentIndex[nodeIndex];
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(layoutIndex);
  });
  const textLayers = [];
  let isTextTruncated = false;
  for (const [parent, layoutIndexes] of groups) {
    const first = layoutIndexes[0];
    const visible = layoutIndexes.filter((layoutIndex) =>
      isOnCanvas(
        {
          x: layout.bounds[layoutIndex][0],
          y: layout.bounds[layoutIndex][1],
          width: layout.bounds[layoutIndex][2],
          height: layout.bounds[layoutIndex][3],
        },
        width,
        height,
      ),
    );
    const opacity = opacityOf(parent);
    if (
      visible.length === 0 ||
      style(first, 'visibility') !== 'visible' ||
      !(opacity > 0)
    )
      continue;
    if (textLayers.length >= EVIDENCE_LIMITS.textLayers) {
      isTextTruncated = true;
      continue;
    }
    const joined = visible
      .map((layoutIndex) => string(layout.text[layoutIndex]))
      .join(' ');
    const color = style(first, 'color') ?? '';
    textLayers.push({
      backendNodeId: nodes.backendNodeId[parent],
      text: clamp(joined, EVIDENCE_LIMITS.textLength),
      isTextTruncated: joined.length > EVIDENCE_LIMITS.textLength,
      bounds: union(visible.map((layoutIndex) => layout.bounds[layoutIndex])),
      fontFamily: clamp(style(first, 'font-family') ?? '', 1024),
      fontSizePx: Number.parseFloat(style(first, 'font-size') ?? '') || 0,
      fontWeight: style(first, 'font-weight'),
      fontStyle: style(first, 'font-style'),
      color: { css: clamp(color, 64), hex: parseCssColor(color) },
      opacity: Math.min(1, opacity),
      platformFonts: null,
    });
  }
  if (isTextTruncated) diagnostics.push('text_layers_truncated');

  const placedAssets = [];
  layout.nodeIndex.forEach((nodeIndex, layoutIndex) => {
    const bounds = layout.bounds[layoutIndex];
    const box = {
      x: bounds[0],
      y: bounds[1],
      width: bounds[2],
      height: bounds[3],
    };
    if (!isOnCanvas(box, width, height)) return;
    if (style(layoutIndex, 'visibility') !== 'visible') return;
    const opacity = opacityOf(nodeIndex);
    if (!(opacity > 0)) return;
    const tag = string(nodes.nodeName[nodeIndex]);
    const transform = clamp(style(layoutIndex, 'transform') ?? 'none', 256);
    const sources = [];
    if (PLACED_TAGS.has(tag))
      sources.push({
        role: PLACED_TAGS.get(tag),
        raw: attribute(nodeIndex, 'src'),
      });
    const background = style(layoutIndex, 'background-image') ?? 'none';
    for (const match of background.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g))
      sources.push({ role: 'background_image', raw: match[2] });
    for (const source of sources) {
      if (placedAssets.length >= EVIDENCE_LIMITS.placedAssets) {
        diagnostics.push('placed_assets_truncated');
        return;
      }
      const resolved = resolveSource(source.raw, assetHashes, origin, loaded);
      placedAssets.push({
        role: source.role,
        sourceKind: resolved.kind,
        assetId: resolved.assetId,
        contentHash: resolved.contentHash,
        bounds: box,
        transform,
        opacity: Math.min(1, opacity),
      });
    }
  });
  return { diagnostics: [...new Set(diagnostics)], textLayers, placedAssets };
}

export function normalizeFontFace(font, assetHashes, origin, loaded) {
  const source = resolveSource(font.src, assetHashes, origin, loaded);
  return {
    family: clamp(String(font.fontFamily ?? ''), 512),
    style: clamp(String(font.fontStyle ?? 'normal'), 32),
    weight: clamp(String(font.fontWeight ?? '400'), 32),
    platformFamily:
      typeof font.platformFontFamily === 'string'
        ? clamp(font.platformFontFamily, 512)
        : null,
    source: {
      kind: source.kind,
      assetId: source.assetId,
      contentHash: source.contentHash,
    },
  };
}

function withTimeout(promise, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), CAPTURE_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function queryPlatformFonts(send, layers) {
  if (layers.length === 0) return;
  await send('DOM.getDocument', { depth: 0 });
  const pushed = await send('DOM.pushNodesByBackendIdsToFrontend', {
    backendNodeIds: layers.map((layer) => layer.backendNodeId),
  });
  const nodeIds = pushed.value?.nodeIds ?? [];
  for (const [index, layer] of layers.entries()) {
    if (!nodeIds[index]) continue;
    try {
      const response = await send('CSS.getPlatformFontsForNode', {
        nodeId: nodeIds[index],
      });
      layer.platformFonts = (response.value?.fonts ?? [])
        .slice(0, EVIDENCE_LIMITS.platformFonts)
        .map((font) => ({
          familyName: clamp(String(font.familyName ?? ''), 512),
          postScriptName:
            typeof font.postScriptName === 'string' && font.postScriptName
              ? clamp(font.postScriptName, 512)
              : null,
          isCustomFont: font.isCustomFont === true,
          glyphCount: Number.isInteger(font.glyphCount) ? font.glyphCount : 0,
        }));
    } catch {
      layer.platformFonts = null;
    }
  }
}

/**
 * Captures evidence at the instant Chromium is asked for each screenshot, so the
 * observed DOM is exactly the frame that becomes the exported pixels.
 */
export class RenderEvidenceRun {
  constructor({ frames, frameCount, width, height, assetHashes }) {
    this.wanted = new Set(frames);
    this.frameCount = frameCount;
    this.width = width;
    this.height = height;
    this.assetHashes = assetHashes;
    this.captured = new Set();
    this.captures = [];
    this.rawFontFaces = new Map();
    this.diagnostics = new Set();
    this.origin = null;
    this.pageOrigin = () => null;
    this.loaded = new Set();
    this.browser = null;
    this.currentFrame = null;
  }
  recordFrameRequest(params) {
    const frame = params?.arguments?.[0]?.value;
    if (Number.isInteger(frame)) this.currentFrame = frame;
  }
  /** A URL Chromium got a successful response for, or served from its cache. */
  recordLoaded(href) {
    const key = typeof href === 'string' ? fetchedKey(href) : null;
    if (key !== null && this.loaded.size < 10_000) this.loaded.add(key);
  }
  recordFontFace(font) {
    if (this.rawFontFaces.size >= EVIDENCE_LIMITS.fontFaces) {
      this.diagnostics.add('font_faces_truncated');
      return;
    }
    this.rawFontFaces.set(
      JSON.stringify([
        font.fontFamily,
        font.fontStyle,
        font.fontWeight,
        font.platformFontFamily,
        font.src,
      ]),
      font,
    );
  }
  async capture(send) {
    const frame = this.currentFrame;
    if (
      !Number.isInteger(frame) ||
      !this.wanted.has(frame) ||
      this.captured.has(frame)
    )
      return;
    this.captured.add(frame);
    try {
      await withTimeout(this.observe(send, frame), 'evidence_capture_timeout');
    } catch {
      this.diagnostics.add('evidence_capture_failed');
    }
  }
  async observe(send, frame) {
    if (!this.browser) {
      const version = await send('Browser.getVersion', {});
      this.browser = {
        product: clamp(String(version.value?.product ?? ''), 128) || null,
        revision: clamp(String(version.value?.revision ?? ''), 128) || null,
      };
    }
    const snapshot = await send('DOMSnapshot.captureSnapshot', {
      computedStyles: STYLE_NAMES,
      includeDOMRects: false,
    });
    this.origin = this.pageOrigin() ?? this.origin;
    const analysis = analyzeSnapshot(snapshot.value, {
      assetHashes: this.assetHashes,
      width: this.width,
      height: this.height,
      origin: this.origin,
      loaded: this.loaded,
    });
    for (const code of analysis.diagnostics) this.diagnostics.add(code);
    if (!analysis.textLayers) throw new Error('snapshot_empty');
    await queryPlatformFonts(send, analysis.textLayers);
    this.captures.push({
      frame,
      textLayers: analysis.textLayers.map(
        ({ backendNodeId: _backendNodeId, ...layer }) => layer,
      ),
      placedAssets: analysis.placedAssets,
    });
  }
  result() {
    if (this.captured.size < this.wanted.size)
      this.diagnostics.add('evidence_frames_missing');
    return {
      schemaVersion: EVIDENCE_VERSION,
      browser: this.browser,
      frameCount: this.frameCount,
      captures: [...this.captures].sort((a, b) => a.frame - b.frame),
      fontFaces: [...this.rawFontFaces.values()].map((font) =>
        normalizeFontFace(font, this.assetHashes, this.origin, this.loaded),
      ),
      assets: [...this.assetHashes].map(([id, contentHash]) => ({
        id,
        contentHash,
      })),
      diagnostics: [...this.diagnostics],
    };
  }
}

/** Frames inspected for an output: the requested still, or three samples of a video. */
export function framesToInspect(request, durationFrames) {
  if (request.format !== 'mp4') return [request.frame];
  return [
    ...new Set([0, Math.floor((durationFrames - 1) / 2), durationFrames - 1]),
  ];
}

/**
 * Hooks the pages Remotion opens inside `browser`. `begin` must be called before
 * each render and `end` after it; pages opened outside that window are ignored.
 */
export function attachRenderEvidence(browser, { assetHashes, width, height }) {
  let run = null;
  const openPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await openPage(...args);
    const current = run;
    if (current) {
      try {
        const client = page._client();
        current.pageOrigin = () => {
          try {
            return new URL(page.url()).origin;
          } catch {
            return null;
          }
        };
        await client.send('Network.enable');
        await client.send('DOM.enable');
        await client.send('CSS.enable');
        const requested = new Map();
        client.on('Network.requestWillBeSent', (event) => {
          if (requested.size < 10_000)
            requested.set(event?.requestId, event?.request?.url);
        });
        client.on('Network.responseReceived', (event) => {
          const status = event?.response?.status;
          if (status >= 200 && status < 400)
            current.recordLoaded(event.response.url);
        });
        client.on('Network.requestServedFromCache', (event) =>
          current.recordLoaded(requested.get(event?.requestId)),
        );
        client.on('CSS.fontsUpdated', (event) => {
          if (event?.font) current.recordFontFace(event.font);
        });
        const send = client.send.bind(client);
        client.send = async (method, params) => {
          if (
            method === 'Runtime.callFunctionOn' &&
            typeof params?.functionDeclaration === 'string' &&
            params.functionDeclaration.includes('remotion_setFrame')
          )
            current.recordFrameRequest(params);
          else if (method === 'Page.captureScreenshot')
            await current.capture(send);
          return send(method, params);
        };
      } catch {
        current.diagnostics.add('evidence_hook_failed');
      }
    }
    return page;
  };
  return {
    begin(request, settings) {
      run = new RenderEvidenceRun({
        frames: framesToInspect(request, settings.durationFrames),
        frameCount: settings.durationFrames,
        width,
        height,
        assetHashes,
      });
    },
    end() {
      const finished = run;
      run = null;
      return finished ? finished.result() : null;
    },
  };
}
