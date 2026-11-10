import { Parser } from 'htmlparser2';

/**
 * Server-side SVG sanitizer for brand logos (#9706).
 *
 * A stored SVG is a scriptable document, so an uploaded logo is never kept as
 * sent. The markup is tokenized and written out again from an allowlist:
 * only drawing elements and presentation attributes survive, every reference
 * must point inside the document, and the output is regenerated with escaped
 * values, so nothing the parser tolerated (comments, DOCTYPE and entity
 * declarations, processing instructions, namespaced extras) carries over.
 * Anything not on the list is dropped with its whole subtree.
 */

export const SVG_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const MAX_ELEMENTS = 10_000;
const MAX_DEPTH = 64;
const MAX_USE_ELEMENTS = 200;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

const ALLOWED_ELEMENTS = new Set([
  'circle',
  'clipPath',
  'defs',
  'desc',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'filter',
  'g',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'stop',
  'style',
  'svg',
  'symbol',
  'text',
  'textPath',
  'title',
  'tspan',
  'use',
]);

const ALLOWED_ATTRIBUTES = new Set([
  'class',
  'clip-path',
  'clip-rule',
  'clipPathUnits',
  'color',
  'color-interpolation-filters',
  'cx',
  'cy',
  'd',
  'display',
  'dominant-baseline',
  'dx',
  'dy',
  'fill',
  'fill-opacity',
  'fill-rule',
  'filter',
  'filterUnits',
  'flood-color',
  'flood-opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'fr',
  'fx',
  'fy',
  'gradientTransform',
  'gradientUnits',
  'height',
  'href',
  'id',
  'in',
  'in2',
  'isolation',
  'k1',
  'k2',
  'k3',
  'k4',
  'lengthAdjust',
  'letter-spacing',
  'markerHeight',
  'markerUnits',
  'markerWidth',
  'mask',
  'maskContentUnits',
  'maskUnits',
  'mix-blend-mode',
  'mode',
  'offset',
  'opacity',
  'operator',
  'orient',
  'overflow',
  'paint-order',
  'pathLength',
  'patternContentUnits',
  'patternTransform',
  'patternUnits',
  'points',
  'preserveAspectRatio',
  'primitiveUnits',
  'r',
  'radius',
  'refX',
  'refY',
  'result',
  'rotate',
  'rx',
  'ry',
  'shape-rendering',
  'spreadMethod',
  'stdDeviation',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'style',
  'text-anchor',
  'text-decoration',
  'textLength',
  'transform',
  'type',
  'values',
  'vector-effect',
  'viewBox',
  'visibility',
  'width',
  'word-spacing',
  'x',
  'x1',
  'x2',
  'xlink:href',
  'xml:space',
  'y',
  'y1',
  'y2',
]);

const REFERENCE_ATTRIBUTES = new Set(['href', 'xlink:href']);
/** A reference to an element in the same document: `#id`. */
const LOCAL_REFERENCE_PATTERN = /^#[A-Za-z_][\w.:-]*$/;
/** Every `url(...)` must be a local reference: `url(#id)`. */
const URL_FUNCTION_PATTERN = /url\s*\(/gi;
const LOCAL_URL_FUNCTION_PATTERN =
  /^url\s*\(\s*(["']?)#[A-Za-z_][\w.:-]*\1\s*\)/i;
/**
 * Anything that can load, run or hide content in CSS or attribute values.
 * Backslashes are refused outright: CSS escapes could spell `url(` unseen.
 */
const UNSAFE_VALUE_PATTERN =
  /javascript:|vbscript:|data:|expression\s*\(|@import|behavior\s*:|-moz-binding|\\|</i;

type SvgLogoRejection =
  | 'svg_logo_too_large'
  | 'svg_logo_not_svg'
  | 'svg_logo_too_complex';

export class SvgLogoRejectedError extends Error {
  constructor(readonly reason: SvgLogoRejection) {
    super(reason);
    this.name = 'SvgLogoRejectedError';
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Whether every `url(...)` in a value points inside the document. */
function hasOnlyLocalUrls(value: string): boolean {
  for (const match of value.matchAll(URL_FUNCTION_PATTERN)) {
    if (!LOCAL_URL_FUNCTION_PATTERN.test(value.slice(match.index))) {
      return false;
    }
  }
  return true;
}

/** Whether a CSS block or attribute value is free of loads and scripts. */
function isSafeSvgValue(value: string): boolean {
  return !UNSAFE_VALUE_PATTERN.test(value) && hasOnlyLocalUrls(value);
}

function sanitizeAttributes(attribs: Record<string, string>): string {
  const kept: string[] = [];
  for (const [name, value] of Object.entries(attribs)) {
    if (!ALLOWED_ATTRIBUTES.has(name)) continue;
    if (REFERENCE_ATTRIBUTES.has(name)) {
      if (LOCAL_REFERENCE_PATTERN.test(value.trim())) {
        kept.push(`${name}="${escapeXml(value.trim())}"`);
      }
      continue;
    }
    if (!isSafeSvgValue(value)) continue;
    kept.push(`${name}="${escapeXml(value)}"`);
  }
  return kept.join(' ');
}

interface OpenElement {
  name: string;
  isKept: boolean;
  /** Text collected for a `<style>` element, checked when it closes. */
  styleText?: string;
}

/**
 * Sanitize an uploaded SVG logo. Returns the regenerated markup, or throws
 * {@link SvgLogoRejectedError} when the file is too large, too complex, or not
 * an SVG document at all. Unsafe parts are removed rather than rejected, so a
 * design-tool export with metadata or editor attributes still uploads.
 */
export function sanitizeSvgLogo(input: Buffer): Buffer {
  if (input.length > SVG_LOGO_MAX_BYTES) {
    throw new SvgLogoRejectedError('svg_logo_too_large');
  }

  const out: string[] = [];
  const stack: OpenElement[] = [];
  let hasRoot = false;
  let isRootClosed = false;
  let skipDepth = 0;
  let elementCount = 0;
  let useCount = 0;
  let rejection: SvgLogoRejection | undefined;

  const parser = new Parser(
    {
      onclosetag(name) {
        const open = stack.pop();
        if (!open || rejection) return;
        if (!open.isKept) {
          skipDepth -= 1;
          return;
        }
        if (open.name === 'style') {
          const css = open.styleText ?? '';
          // An unsafe stylesheet is left out whole, opening tag included.
          const openIndex = out.lastIndexOf('<style>');
          out.length = openIndex;
          if (isSafeSvgValue(css)) {
            out.push(`<style>${escapeXml(css)}</style>`);
          }
          return;
        }
        out.push(`</${name}>`);
        if (stack.length === 0) isRootClosed = true;
      },
      onopentag(name, attribs) {
        if (rejection) return;
        elementCount += 1;
        if (elementCount > MAX_ELEMENTS || stack.length >= MAX_DEPTH) {
          rejection = 'svg_logo_too_complex';
          parser.pause();
          return;
        }
        if (!hasRoot) {
          if (name !== 'svg') {
            rejection = 'svg_logo_not_svg';
            parser.pause();
            return;
          }
          hasRoot = true;
          stack.push({ isKept: true, name });
          const attributes = sanitizeAttributes(attribs);
          out.push(
            `<svg xmlns="${SVG_NAMESPACE}" xmlns:xlink="${XLINK_NAMESPACE}"${attributes ? ` ${attributes}` : ''}>`,
          );
          return;
        }
        const isKept =
          !isRootClosed && skipDepth === 0 && ALLOWED_ELEMENTS.has(name);
        if (name === 'use' && isKept) {
          useCount += 1;
          if (useCount > MAX_USE_ELEMENTS) {
            rejection = 'svg_logo_too_complex';
            parser.pause();
            return;
          }
        }
        stack.push({
          isKept,
          name,
          ...(isKept && name === 'style' ? { styleText: '' } : {}),
        });
        if (!isKept) {
          skipDepth += 1;
          return;
        }
        if (name === 'style') {
          out.push('<style>');
          return;
        }
        const attributes = sanitizeAttributes(attribs);
        out.push(`<${name}${attributes ? ` ${attributes}` : ''}>`);
      },
      ontext(text) {
        if (rejection || skipDepth > 0 || stack.length === 0) return;
        const current = stack[stack.length - 1];
        if (current.styleText !== undefined) {
          current.styleText += text;
          return;
        }
        out.push(escapeXml(text));
      },
    },
    { decodeEntities: true, recognizeCDATA: true, xmlMode: true },
  );
  parser.write(input.toString('utf8'));
  parser.end();

  if (rejection) throw new SvgLogoRejectedError(rejection);
  if (!hasRoot) throw new SvgLogoRejectedError('svg_logo_not_svg');
  // A truncated document still closes every open element; an unclosed
  // stylesheet is left out.
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const open = stack[index];
    if (!open.isKept) continue;
    if (open.name === 'style') {
      out.length = out.lastIndexOf('<style>');
      continue;
    }
    out.push(`</${open.name}>`);
  }
  return Buffer.from(out.join(''), 'utf8');
}
