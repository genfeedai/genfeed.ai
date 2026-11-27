import type {
  AnnotationShapeData,
  TrajectoryPoint,
} from '@genfeedai/contracts/types';
import { describe, expect, it } from 'vitest';
import {
  collectGeometryIssues,
  moveShape,
  readShapes,
  toNormalized,
  totalFramesFor,
  validateShapes,
  validateTrajectory,
  withEvenFrames,
} from '../../engine/utils/geometry';
import {
  createGeometryHistory,
  geometryHistoryReducer,
} from './geometryHistory';

const rect = (overrides: Partial<AnnotationShapeData> = {}) =>
  ({
    height: 0.4,
    id: 's1',
    kind: 'rectangle',
    width: 0.2,
    x: 0.1,
    y: 0.1,
    ...overrides,
  }) as AnnotationShapeData;

describe('normalization', () => {
  it('maps a pointer to the same fraction at any viewport size', () => {
    const small = toNormalized(130, 90, {
      height: 100,
      left: 30,
      top: 40,
      width: 200,
    });
    const large = toNormalized(530, 290, {
      height: 500,
      left: 30,
      top: 40,
      width: 1000,
    });
    expect(small).toEqual({ x: 0.5, y: 0.5 });
    expect(large).toEqual(small);
  });

  it('clamps a pointer outside the image to its edge', () => {
    expect(
      toNormalized(-50, 900, { height: 100, left: 0, top: 0, width: 100 }),
    ).toEqual({
      x: 0,
      y: 1,
    });
  });

  it('returns the origin for an image with no size', () => {
    expect(
      toNormalized(10, 10, { height: 0, left: 0, top: 0, width: 0 }),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe('resize stability and serialization', () => {
  it('keeps shapes bit-identical through a JSON save and reload', () => {
    const shapes: AnnotationShapeData[] = [
      rect(),
      {
        id: 's2',
        kind: 'arrow',
        points: [
          { x: 0.12345678, y: 0.5 },
          { x: 0.9, y: 0.1 },
        ],
      },
      { id: 's3', kind: 'text', text: 'Label', x: 0.3, y: 0.2 },
    ];
    expect(readShapes(JSON.parse(JSON.stringify(shapes)))).toEqual(shapes);
  });

  it('does not drift across repeated draw-and-resize round trips', () => {
    let point = { x: 0.3333333, y: 0.7777777 };
    for (const [width, height] of [
      [320, 180],
      [1280, 720],
      [390, 220],
      [1920, 1080],
    ]) {
      const rectangle = { height, left: 0, top: 0, width };
      point = toNormalized(point.x * width, point.y * height, rectangle);
    }
    expect(point.x).toBeCloseTo(0.3333333, 10);
    expect(point.y).toBeCloseTo(0.7777777, 10);
  });

  it('drops saved entries that are not known shapes', () => {
    expect(
      readShapes([rect(), { id: 'x', kind: 'star' }, null, 'text']),
    ).toEqual([rect()]);
    expect(readShapes(undefined)).toEqual([]);
  });
});

describe('even frames', () => {
  it('spreads points over the clip from first to last frame', () => {
    const points = withEvenFrames(
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 },
      ],
      totalFramesFor(5),
    );
    expect(points.map((point) => point.frame)).toEqual([0, 60, 119]);
  });
});

describe('validateShapes', () => {
  it.each([
    [
      'a rectangle past the right edge',
      rect({ x: 0.9, width: 0.3 }),
      'outsideImage',
    ],
    ['a rectangle with no area', rect({ width: 0 }), 'noArea'],
    [
      'empty text',
      {
        id: 's1',
        kind: 'text',
        text: '  ',
        x: 0.2,
        y: 0.2,
      } as AnnotationShapeData,
      'emptyText',
    ],
    [
      'a one-point arrow',
      {
        id: 's1',
        kind: 'arrow',
        points: [{ x: 0.1, y: 0.1 }],
      } as AnnotationShapeData,
      'tooFewPoints',
    ],
    [
      'a freehand point off the image',
      {
        id: 's1',
        kind: 'freehand',
        points: [
          { x: 0.1, y: 0.1 },
          { x: 1.2, y: 0.1 },
        ],
      } as AnnotationShapeData,
      'outsideImage',
    ],
  ])('flags %s', (_name, shape, code) => {
    expect(validateShapes([shape])).toEqual([
      expect.objectContaining({ code, id: 's1' }),
    ]);
  });

  it('accepts shapes that touch the image edge', () => {
    expect(validateShapes([rect({ x: 0, y: 0, width: 1, height: 1 })])).toEqual(
      [],
    );
  });

  it('names a shape by its position among shapes of its kind', () => {
    const issues = validateShapes([rect(), rect({ id: 's2', x: 0.95 })]);
    expect(issues).toEqual([
      expect.objectContaining({
        id: 's2',
        subject: { index: 2, kind: 'rectangle' },
      }),
    ]);
  });
});

describe('validateTrajectory', () => {
  const point = (frame: number, x = 0.5, y = 0.5): TrajectoryPoint => ({
    frame,
    x,
    y,
  });

  it('needs at least two points', () => {
    expect(validateTrajectory([point(0)], 120)).toEqual([
      expect.objectContaining({ code: 'pathTooShort' }),
    ]);
  });

  it('flags a point outside the image, past the clip, or out of time order', () => {
    expect(
      validateTrajectory(
        [point(0), point(10, 1.2), point(500), point(60), point(60)],
        120,
      ),
    ).toEqual([
      expect.objectContaining({ code: 'outsideImage', id: 'p1' }),
      expect.objectContaining({ code: 'pastEnd', frame: 500, id: 'p2' }),
      expect.objectContaining({ code: 'notAfterPrevious', id: 'p3' }),
      expect.objectContaining({ code: 'notAfterPrevious', id: 'p4' }),
    ]);
  });

  it('accepts a valid path', () => {
    expect(validateTrajectory([point(0), point(60), point(119)], 120)).toEqual(
      [],
    );
  });
});

describe('collectGeometryIssues', () => {
  it('names the node of each problem and passes a video transfer motion node', () => {
    const issues = collectGeometryIssues([
      {
        data: { annotations: [rect({ x: 0.95 })] },
        id: 'a',
        type: 'annotation',
      },
      {
        data: { duration: 5, mode: 'trajectory', trajectoryPoints: [] },
        id: 'm',
        type: 'motionControl',
      },
      {
        data: { mode: 'camera', trajectoryPoints: [] },
        id: 'c',
        type: 'motionControl',
      },
      { data: { mode: 'video_transfer' }, id: 'v', type: 'motionControl' },
      { data: {}, id: 'p', type: 'prompt' },
    ]);
    expect(issues.map((issue) => [issue.nodeId, issue.code])).toEqual([
      ['a', 'outsideImage'],
      ['m', 'unsupportedMode'],
      ['c', 'unsupportedMode'],
    ]);
  });
});

describe('moveShape', () => {
  it('moves boxes and lines without clamping', () => {
    expect(moveShape(rect(), 0.95, 0)).toMatchObject({ x: 1.05 });
    expect(
      moveShape(
        {
          id: 's',
          kind: 'arrow',
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.2, y: 0.2 },
          ],
        },
        0.1,
        0,
      ),
    ).toMatchObject({
      points: [
        { x: 0.2, y: 0.1 },
        { x: 0.30000000000000004, y: 0.2 },
      ],
    });
  });
});

describe('geometry history', () => {
  const start = createGeometryHistory<number>([1, 2]);

  it('undoes a commit and clears the selection', () => {
    const next = geometryHistoryReducer(start, {
      items: [1, 2, 3],
      selectedId: 'x',
      type: 'commit',
    });
    expect(geometryHistoryReducer(next, { type: 'undo' })).toMatchObject({
      items: [1, 2],
      selectedId: null,
    });
  });

  it('treats a checkpoint and its live edits as one undo step', () => {
    let state = geometryHistoryReducer(start, { type: 'checkpoint' });
    state = geometryHistoryReducer(state, { items: [5, 2], type: 'live' });
    state = geometryHistoryReducer(state, { items: [6, 2], type: 'live' });
    expect(geometryHistoryReducer(state, { type: 'undo' }).items).toEqual([
      1, 2,
    ]);
  });

  it('clear is undoable and does nothing on an empty list', () => {
    const cleared = geometryHistoryReducer(start, { type: 'clear' });
    expect(cleared.items).toEqual([]);
    expect(geometryHistoryReducer(cleared, { type: 'undo' }).items).toEqual([
      1, 2,
    ]);
    const empty = createGeometryHistory<number>([]);
    expect(geometryHistoryReducer(empty, { type: 'clear' })).toBe(empty);
  });

  it('ignores undo with no history', () => {
    expect(geometryHistoryReducer(start, { type: 'undo' })).toBe(start);
  });
});
