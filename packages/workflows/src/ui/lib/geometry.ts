import { readRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import type {
  AnnotationShapeData,
  AnnotationShapeKind,
  NormalizedPoint,
  TrajectoryPoint,
} from '@genfeedai/contracts/types';

/**
 * Normalized geometry for the annotation and motion-trajectory editors. Every coordinate is a
 * fraction (0..1) of the image, so saved geometry survives a reload and a viewport resize without
 * drift. Pure functions only: the editor dialog and the run-time guard share this module.
 */

export type GeometryIssueCode =
  | 'noArea'
  | 'outsideImage'
  | 'emptyText'
  | 'tooFewPoints'
  | 'pathTooShort'
  | 'pastEnd'
  | 'notAfterPrevious';

/** What an issue names: a shape kind and its 1-based position among shapes of that kind, or a path point. */
export type GeometrySubject =
  | { index: number; kind: AnnotationShapeKind }
  | { index: number; kind: 'point' }
  | { kind: 'path' };

export interface GeometryIssue {
  code: GeometryIssueCode;
  /** The frame a point lands on, for `pastEnd`. */
  frame?: number;
  /** Id of the shape, or `p<index>` for a path point, or `path`. */
  id: string;
  subject: GeometrySubject;
}

export const FRAMES_PER_SECOND = 24;
export const MIN_SHAPE_SIZE = 0.005;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isInside(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Converts a pointer position to image fractions, clamped to the image. */
export function toNormalized(
  clientX: number,
  clientY: number,
  rect: { height: number; left: number; top: number; width: number },
): NormalizedPoint {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function totalFramesFor(durationSeconds: number): number {
  return durationSeconds * FRAMES_PER_SECOND;
}

/** Points are time-ordered; frames are spread evenly over the clip, so a drawn path is always valid in time. */
export function withEvenFrames(
  points: readonly NormalizedPoint[],
  totalFrames: number,
): TrajectoryPoint[] {
  const last = Math.max(1, points.length - 1);
  return points.map((point, index) => ({
    frame: Math.round((index * (totalFrames - 1)) / last),
    x: point.x,
    y: point.y,
  }));
}

/** 1-based position of a shape among the shapes of its kind. */
export function shapeSubject(
  shapes: readonly AnnotationShapeData[],
  shape: AnnotationShapeData,
): GeometrySubject {
  const sameKind = shapes.filter((candidate) => candidate.kind === shape.kind);
  return { index: sameKind.indexOf(shape) + 1, kind: shape.kind };
}

export function validateShapes(
  shapes: readonly AnnotationShapeData[],
): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  for (const shape of shapes) {
    const subject = shapeSubject(shapes, shape);
    const report = (code: GeometryIssueCode) =>
      issues.push({ code, id: shape.id, subject });

    if (shape.kind === 'rectangle' || shape.kind === 'ellipse') {
      if (shape.width < MIN_SHAPE_SIZE || shape.height < MIN_SHAPE_SIZE) {
        report('noArea');
      } else if (
        ![
          shape.x,
          shape.y,
          shape.x + shape.width,
          shape.y + shape.height,
        ].every(isInside)
      ) {
        report('outsideImage');
      }
    } else if (shape.kind === 'text') {
      if (!shape.text.trim()) {
        report('emptyText');
      } else if (![shape.x, shape.y].every(isInside)) {
        report('outsideImage');
      }
    } else if (shape.points.length < 2) {
      report('tooFewPoints');
    } else if (
      !shape.points.every((point) => isInside(point.x) && isInside(point.y))
    ) {
      report('outsideImage');
    }
  }
  return issues;
}

export function validateTrajectory(
  points: readonly TrajectoryPoint[],
  totalFrames: number,
): GeometryIssue[] {
  if (points.length < 2) {
    return [{ code: 'pathTooShort', id: 'path', subject: { kind: 'path' } }];
  }
  const issues: GeometryIssue[] = [];
  points.forEach((point, position) => {
    const subject: GeometrySubject = { index: position + 1, kind: 'point' };
    const id = `p${position}`;
    if (!isInside(point.x) || !isInside(point.y)) {
      issues.push({ code: 'outsideImage', id, subject });
    } else if (point.frame < 0 || point.frame >= totalFrames) {
      issues.push({ code: 'pastEnd', frame: point.frame, id, subject });
    } else if (position > 0 && point.frame <= points[position - 1].frame) {
      issues.push({ code: 'notAfterPrevious', id, subject });
    }
  });
  return issues;
}

/** A shape moved by (dx, dy), not clamped: a move off the image becomes an issue the editor names. */
export function moveShape(
  shape: AnnotationShapeData,
  dx: number,
  dy: number,
): AnnotationShapeData {
  if (shape.kind === 'arrow' || shape.kind === 'freehand') {
    return {
      ...shape,
      points: shape.points.map((point) => ({
        x: point.x + dx,
        y: point.y + dy,
      })),
    };
  }
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
}

/** Parses saved annotation data defensively; anything that is not a known shape is dropped. */
export function readShapes(value: unknown): AnnotationShapeData[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is AnnotationShapeData => {
    if (typeof candidate !== 'object' || candidate === null) return false;
    const record = candidate as Record<string, unknown>;
    if (typeof record.id !== 'string') return false;
    if (record.kind === 'rectangle' || record.kind === 'ellipse') {
      return ['x', 'y', 'width', 'height'].every(
        (key) => typeof record[key] === 'number',
      );
    }
    if (record.kind === 'text') {
      return (
        typeof record.text === 'string' &&
        typeof record.x === 'number' &&
        typeof record.y === 'number'
      );
    }
    if (record.kind === 'arrow' || record.kind === 'freehand') {
      return (
        Array.isArray(record.points) &&
        record.points.every(
          (point) =>
            typeof point === 'object' &&
            point !== null &&
            typeof (point as NormalizedPoint).x === 'number' &&
            typeof (point as NormalizedPoint).y === 'number',
        )
      );
    }
    return false;
  });
}

export function readTrajectoryPoints(value: unknown): TrajectoryPoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (point): point is TrajectoryPoint =>
      typeof point === 'object' &&
      point !== null &&
      typeof (point as TrajectoryPoint).x === 'number' &&
      typeof (point as TrajectoryPoint).y === 'number' &&
      typeof (point as TrajectoryPoint).frame === 'number',
  );
}

export interface NodeGeometryIssue extends GeometryIssue {
  nodeId: string;
  nodeType: 'annotation' | 'motionControl';
}

interface GeometryNodeLike {
  data?: unknown;
  id: string;
  type?: string;
}

/** True when the mode draws a path the subject follows. */
export function modeUsesTrajectory(mode: unknown): boolean {
  return mode === 'trajectory' || mode === 'combined';
}

/**
 * Geometry problems in every annotation and motion-control node of a graph. A run is blocked while
 * this is non-empty. An empty path counts, because a trajectory mode with no path cannot run.
 */
export function collectGeometryIssues(
  nodes: readonly GeometryNodeLike[],
): NodeGeometryIssue[] {
  const found: NodeGeometryIssue[] = [];
  for (const node of nodes) {
    const data = readRecord(node.data);
    if (node.type === 'annotation') {
      for (const issue of validateShapes(readShapes(data.annotations))) {
        found.push({ ...issue, nodeId: node.id, nodeType: 'annotation' });
      }
    } else if (node.type === 'motionControl' && modeUsesTrajectory(data.mode)) {
      const duration = data.duration === 10 ? 10 : 5;
      for (const issue of validateTrajectory(
        readTrajectoryPoints(data.trajectoryPoints),
        totalFramesFor(duration),
      )) {
        found.push({ ...issue, nodeId: node.id, nodeType: 'motionControl' });
      }
    }
  }
  return found;
}
