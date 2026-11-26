import type {
  AnnotationShapeData,
  NormalizedPoint,
} from '@genfeedai/contracts/types';
import { readShapes, validateShapes } from '../../utils/geometry';

/**
 * The editor draws on a 1000 unit wide stage; a rendered image scales those sizes by its own width so
 * a saved annotation looks the same at any resolution.
 */
const STAGE_WIDTH = 1000;
const STROKE_COLOR = '#e5484d';
const STROKE_WIDTH = 3;
const FONT_SIZE = 30;
const ARROW_HEAD_SIZE = 22;
const ARROW_HEAD_SPREAD = 0.45;

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&apos;',
  '<': '&lt;',
  '>': '&gt;',
};
const XML_SPECIAL_PATTERN = /["&'<>]/g;

function escapeXml(value: string): string {
  return value.replace(
    XML_SPECIAL_PATTERN,
    (char) => XML_ESCAPES[char] ?? char,
  );
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

interface Canvas {
  height: number;
  unit: number;
  width: number;
}

function px(point: NormalizedPoint, canvas: Canvas): string {
  return `${round(point.x * canvas.width)},${round(point.y * canvas.height)}`;
}

function arrowHead(
  from: NormalizedPoint,
  to: NormalizedPoint,
  canvas: Canvas,
): string {
  const angle = Math.atan2(
    (to.y - from.y) * canvas.height,
    (to.x - from.x) * canvas.width,
  );
  const size = ARROW_HEAD_SIZE * canvas.unit;
  const x = to.x * canvas.width;
  const y = to.y * canvas.height;
  const left = `${round(x - size * Math.cos(angle - ARROW_HEAD_SPREAD))},${round(y - size * Math.sin(angle - ARROW_HEAD_SPREAD))}`;
  const right = `${round(x - size * Math.cos(angle + ARROW_HEAD_SPREAD))},${round(y - size * Math.sin(angle + ARROW_HEAD_SPREAD))}`;
  return `<polyline points="${left} ${round(x)},${round(y)} ${right}"/>`;
}

function renderShape(shape: AnnotationShapeData, canvas: Canvas): string {
  if (shape.kind === 'rectangle') {
    return `<rect x="${round(shape.x * canvas.width)}" y="${round(shape.y * canvas.height)}" width="${round(shape.width * canvas.width)}" height="${round(shape.height * canvas.height)}"/>`;
  }
  if (shape.kind === 'ellipse') {
    return `<ellipse cx="${round((shape.x + shape.width / 2) * canvas.width)}" cy="${round((shape.y + shape.height / 2) * canvas.height)}" rx="${round((shape.width / 2) * canvas.width)}" ry="${round((shape.height / 2) * canvas.height)}"/>`;
  }
  if (shape.kind === 'text') {
    return `<text x="${round(shape.x * canvas.width)}" y="${round(shape.y * canvas.height)}" fill="${STROKE_COLOR}" stroke="none" font-size="${round(FONT_SIZE * canvas.unit)}" font-weight="600">${escapeXml(shape.text)}</text>`;
  }
  const line = `<polyline points="${shape.points.map((point) => px(point, canvas)).join(' ')}"/>`;
  if (shape.kind === 'arrow') {
    return `<g>${line}${arrowHead(shape.points[0], shape.points[shape.points.length - 1], canvas)}</g>`;
  }
  return line;
}

/**
 * Renders normalized annotation shapes as an SVG overlay sized to the image in pixels. Shapes must
 * already be valid: the executor validates them before any pixel is read.
 */
export function buildAnnotationSvg(
  shapes: readonly AnnotationShapeData[],
  width: number,
  height: number,
): string {
  const canvas: Canvas = { height, unit: width / STAGE_WIDTH, width };
  const strokeWidth = Math.max(2, STROKE_WIDTH * canvas.unit);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="${STROKE_COLOR}" stroke-width="${round(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round">${shapes.map((shape) => renderShape(shape, canvas)).join('')}</g></svg>`;
}

export const MAX_ANNOTATION_SHAPES = 200;
export const MAX_ANNOTATION_POINTS = 2000;
export const MAX_ANNOTATION_TEXT_LENGTH = 280;

/**
 * Parses saved annotations for a run. Anything malformed, empty, oversized or outside the image is
 * refused with the shape to fix, before an image is read or an output exists.
 */
export function prepareAnnotationShapes(value: unknown): AnnotationShapeData[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Add at least one annotation before running this node');
  }
  if (value.length > MAX_ANNOTATION_SHAPES) {
    throw new Error(
      `An annotation node draws at most ${MAX_ANNOTATION_SHAPES} shapes`,
    );
  }
  const shapes = readShapes(value);
  if (shapes.length !== value.length) {
    throw new Error('An annotation has an unknown or incomplete shape');
  }
  for (const shape of shapes) {
    if (
      (shape.kind === 'arrow' || shape.kind === 'freehand') &&
      shape.points.length > MAX_ANNOTATION_POINTS
    ) {
      throw new Error(
        `A ${shape.kind} annotation has at most ${MAX_ANNOTATION_POINTS} points`,
      );
    }
    if (
      shape.kind === 'text' &&
      shape.text.length > MAX_ANNOTATION_TEXT_LENGTH
    ) {
      throw new Error(
        `Annotation text is at most ${MAX_ANNOTATION_TEXT_LENGTH} characters`,
      );
    }
  }
  const [issue] = validateShapes(shapes);
  if (issue) {
    throw new Error(
      `Fix the ${issue.subject.kind} annotation (${issue.code}) before running this node`,
    );
  }
  return shapes;
}
