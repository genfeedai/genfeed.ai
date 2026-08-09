import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AnnotationShape,
  type RectangleShape,
  useAnnotationStore,
} from './annotationStore';

function makeRectangle(
  overrides: Partial<RectangleShape> = {},
): RectangleShape {
  return {
    fillColor: null,
    height: 40,
    id: 'rect-1',
    strokeColor: '#ef4444',
    strokeWidth: 3,
    type: 'rectangle',
    width: 60,
    x: 10,
    y: 20,
    ...overrides,
  };
}

beforeEach(() => {
  useAnnotationStore.getState().closeAnnotation();
});

describe('annotationStore — open/close lifecycle', () => {
  it('openAnnotation seeds state and history', () => {
    const existing = [makeRectangle()];
    useAnnotationStore.getState().openAnnotation('node-1', 'img.png', existing);

    const state = useAnnotationStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.nodeId).toBe('node-1');
    expect(state.sourceImage).toBe('img.png');
    expect(state.shapes).toEqual(existing);
    expect(state.history).toEqual([existing]);
    expect(state.historyIndex).toBe(0);
    expect(state.currentTool).toBe('rectangle');
  });

  it('openAnnotation defaults to no shapes', () => {
    useAnnotationStore.getState().openAnnotation('node-1', 'img.png');
    expect(useAnnotationStore.getState().shapes).toEqual([]);
  });

  it('closeAnnotation resets everything', () => {
    useAnnotationStore.getState().openAnnotation('node-1', 'img.png');
    useAnnotationStore.getState().addShape(makeRectangle());
    useAnnotationStore.getState().closeAnnotation();

    const state = useAnnotationStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.nodeId).toBeNull();
    expect(state.sourceImage).toBeNull();
    expect(state.shapes).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.historyIndex).toBe(-1);
  });

  it('saveAndClose returns the shapes and resets', () => {
    useAnnotationStore.getState().openAnnotation('node-1', 'img.png');
    const shape = makeRectangle();
    useAnnotationStore.getState().addShape(shape);

    const result = useAnnotationStore.getState().saveAndClose();
    expect(result).toEqual({ nodeId: 'node-1', shapes: [shape] });
    expect(useAnnotationStore.getState().isOpen).toBe(false);
    expect(useAnnotationStore.getState().shapes).toEqual([]);
  });

  it('saveAndClose returns null when no annotation is open', () => {
    expect(useAnnotationStore.getState().saveAndClose()).toBeNull();
  });
});

describe('annotationStore — shape operations', () => {
  beforeEach(() => {
    useAnnotationStore.getState().openAnnotation('node-1', 'img.png');
  });

  it('addShape appends the shape and pushes history', () => {
    const shape = makeRectangle();
    useAnnotationStore.getState().addShape(shape);

    const state = useAnnotationStore.getState();
    expect(state.shapes).toEqual([shape]);
    expect(state.history).toHaveLength(2);
    expect(state.historyIndex).toBe(1);
  });

  it('updateShape merges updates by id', () => {
    useAnnotationStore.getState().addShape(makeRectangle());
    useAnnotationStore.getState().updateShape('rect-1', { x: 99 });

    const updated = useAnnotationStore.getState().shapes[0] as RectangleShape;
    expect(updated.x).toBe(99);
    expect(updated.y).toBe(20);
  });

  it('updateShape leaves other shapes untouched', () => {
    useAnnotationStore.getState().addShape(makeRectangle());
    useAnnotationStore.getState().addShape(makeRectangle({ id: 'rect-2' }));
    useAnnotationStore.getState().updateShape('rect-2', { x: 5 });

    const [first, second] = useAnnotationStore.getState().shapes as [
      RectangleShape,
      RectangleShape,
    ];
    expect(first.x).toBe(10);
    expect(second.x).toBe(5);
  });

  it('deleteShape removes the shape and clears its selection', () => {
    useAnnotationStore.getState().addShape(makeRectangle());
    useAnnotationStore.getState().selectShape('rect-1');
    useAnnotationStore.getState().deleteShape('rect-1');

    const state = useAnnotationStore.getState();
    expect(state.shapes).toEqual([]);
    expect(state.selectedShapeId).toBeNull();
  });

  it('deleteShape keeps selection when a different shape is removed', () => {
    useAnnotationStore.getState().addShape(makeRectangle());
    useAnnotationStore.getState().addShape(makeRectangle({ id: 'rect-2' }));
    useAnnotationStore.getState().selectShape('rect-2');
    useAnnotationStore.getState().deleteShape('rect-1');

    expect(useAnnotationStore.getState().selectedShapeId).toBe('rect-2');
  });

  it('clearShapes empties shapes and deselects', () => {
    useAnnotationStore.getState().addShape(makeRectangle());
    useAnnotationStore.getState().selectShape('rect-1');
    useAnnotationStore.getState().clearShapes();

    const state = useAnnotationStore.getState();
    expect(state.shapes).toEqual([]);
    expect(state.selectedShapeId).toBeNull();
    expect(state.historyIndex).toBe(2);
  });

  it('selectShape sets and clears the selection', () => {
    useAnnotationStore.getState().selectShape('rect-1');
    expect(useAnnotationStore.getState().selectedShapeId).toBe('rect-1');
    useAnnotationStore.getState().selectShape(null);
    expect(useAnnotationStore.getState().selectedShapeId).toBeNull();
  });
});

describe('annotationStore — tools', () => {
  it('setTool switches tool and clears selection', () => {
    useAnnotationStore.getState().selectShape('rect-1');
    useAnnotationStore.getState().setTool('circle');

    const state = useAnnotationStore.getState();
    expect(state.currentTool).toBe('circle');
    expect(state.selectedShapeId).toBeNull();
  });

  it('setToolOptions merges partial options', () => {
    useAnnotationStore.getState().setToolOptions({ strokeWidth: 8 });

    const options = useAnnotationStore.getState().toolOptions;
    expect(options.strokeWidth).toBe(8);
    expect(options.strokeColor).toBe('#ef4444');
  });
});

describe('annotationStore — drawing lifecycle', () => {
  beforeEach(() => {
    useAnnotationStore.getState().openAnnotation('node-1', 'img.png');
  });

  it('startDrawing assigns an id and marks drawing', () => {
    useAnnotationStore.getState().startDrawing({
      strokeColor: '#000',
      strokeWidth: 2,
      type: 'rectangle',
    });

    const state = useAnnotationStore.getState();
    expect(state.isDrawing).toBe(true);
    expect(state.drawingShape?.id).toMatch(/^shape-/);
  });

  it('updateDrawing merges into the drawing shape', () => {
    useAnnotationStore.getState().startDrawing({
      height: 0,
      type: 'rectangle',
      width: 0,
      x: 0,
      y: 0,
    });
    useAnnotationStore.getState().updateDrawing({ height: 30, width: 20 });

    const drawing = useAnnotationStore.getState()
      .drawingShape as Partial<RectangleShape>;
    expect(drawing.width).toBe(20);
    expect(drawing.height).toBe(30);
  });

  it('updateDrawing is a no-op when nothing is being drawn', () => {
    useAnnotationStore.getState().updateDrawing({ x: 1 });
    expect(useAnnotationStore.getState().drawingShape).toBeNull();
  });

  it('finishDrawing commits a valid rectangle', () => {
    useAnnotationStore.getState().startDrawing({
      fillColor: null,
      height: 30,
      strokeColor: '#000',
      strokeWidth: 2,
      type: 'rectangle',
      width: 20,
      x: 0,
      y: 0,
    });
    useAnnotationStore.getState().finishDrawing();

    const state = useAnnotationStore.getState();
    expect(state.shapes).toHaveLength(1);
    expect(state.isDrawing).toBe(false);
    expect(state.drawingShape).toBeNull();
  });

  it('finishDrawing discards a too-small rectangle', () => {
    useAnnotationStore.getState().startDrawing({
      height: 2,
      type: 'rectangle',
      width: 2,
      x: 0,
      y: 0,
    });
    useAnnotationStore.getState().finishDrawing();
    expect(useAnnotationStore.getState().shapes).toHaveLength(0);
  });

  it('finishDrawing validates each shape type', () => {
    const store = useAnnotationStore.getState();
    const cases: Array<[Partial<AnnotationShape>, number]> = [
      [{ radius: 10, type: 'circle', x: 0, y: 0 }, 1],
      [{ radius: 2, type: 'circle', x: 0, y: 0 }, 0],
      [{ points: [0, 0, 40, 40], type: 'arrow' }, 1],
      [{ points: [0, 0, 2, 2], type: 'arrow' }, 0],
      [{ points: [0, 0, 1, 1], type: 'freehand' }, 1],
      [{ points: [0, 0], type: 'freehand' }, 0],
      [{ fontSize: 16, text: 'hello', type: 'text', x: 0, y: 0 }, 1],
      [{ fontSize: 16, text: '', type: 'text', x: 0, y: 0 }, 0],
    ];

    for (const [shape, expectedCount] of cases) {
      store.openAnnotation('node-1', 'img.png');
      store.startDrawing(shape);
      store.finishDrawing();
      expect(useAnnotationStore.getState().shapes).toHaveLength(expectedCount);
    }
  });

  it('cancelDrawing drops the in-progress shape', () => {
    useAnnotationStore.getState().startDrawing({ type: 'rectangle' });
    useAnnotationStore.getState().cancelDrawing();

    const state = useAnnotationStore.getState();
    expect(state.isDrawing).toBe(false);
    expect(state.drawingShape).toBeNull();
    expect(state.shapes).toHaveLength(0);
  });
});

describe('annotationStore — undo/redo', () => {
  beforeEach(() => {
    useAnnotationStore.getState().openAnnotation('node-1', 'img.png');
  });

  it('undo restores the previous snapshot', () => {
    useAnnotationStore.getState().addShape(makeRectangle());
    expect(useAnnotationStore.getState().canUndo()).toBe(true);

    useAnnotationStore.getState().undo();
    expect(useAnnotationStore.getState().shapes).toEqual([]);
    expect(useAnnotationStore.getState().canUndo()).toBe(false);
  });

  it('redo reapplies an undone snapshot', () => {
    const shape = makeRectangle();
    useAnnotationStore.getState().addShape(shape);
    useAnnotationStore.getState().undo();
    expect(useAnnotationStore.getState().canRedo()).toBe(true);

    useAnnotationStore.getState().redo();
    expect(useAnnotationStore.getState().shapes).toEqual([shape]);
    expect(useAnnotationStore.getState().canRedo()).toBe(false);
  });

  it('undo/redo at the boundaries are no-ops', () => {
    useAnnotationStore.getState().undo();
    expect(useAnnotationStore.getState().historyIndex).toBe(0);
    useAnnotationStore.getState().redo();
    expect(useAnnotationStore.getState().historyIndex).toBe(0);
  });

  it('adding after undo truncates the redo branch', () => {
    useAnnotationStore.getState().addShape(makeRectangle());
    useAnnotationStore.getState().addShape(makeRectangle({ id: 'rect-2' }));
    useAnnotationStore.getState().undo();
    useAnnotationStore.getState().addShape(makeRectangle({ id: 'rect-3' }));

    expect(useAnnotationStore.getState().canRedo()).toBe(false);
    const ids = useAnnotationStore.getState().shapes.map((s) => s.id);
    expect(ids).toEqual(['rect-1', 'rect-3']);
  });
});
