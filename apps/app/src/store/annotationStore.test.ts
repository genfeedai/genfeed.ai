import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AnnotationShape,
  type AnnotationTool,
  type ArrowShape,
  type CircleShape,
  type RectangleShape,
  useAnnotationStore,
} from '@genfeedai/workflow-ui/stores';

describe('useAnnotationStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAnnotationStore.setState({
      currentTool: 'rectangle',
      drawingShape: null,
      history: [],
      historyIndex: -1,
      isDrawing: false,
      isOpen: false,
      nodeId: null,
      selectedShapeId: null,
      shapes: [],
      sourceImage: null,
      toolOptions: {
        fillColor: null,
        fontSize: 16,
        strokeColor: '#ef4444',
        strokeWidth: 3,
      },
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useAnnotationStore.getState();

      expect(state.isOpen).toBe(false);
      expect(state.nodeId).toBeNull();
      expect(state.sourceImage).toBeNull();
      expect(state.shapes).toEqual([]);
      expect(state.selectedShapeId).toBeNull();
      expect(state.currentTool).toBe('rectangle');
      expect(state.toolOptions.strokeColor).toBe('#ef4444');
      expect(state.toolOptions.strokeWidth).toBe(3);
      expect(state.toolOptions.fillColor).toBeNull();
      expect(state.toolOptions.fontSize).toBe(16);
      expect(state.history).toEqual([]);
      expect(state.historyIndex).toBe(-1);
      expect(state.isDrawing).toBe(false);
      expect(state.drawingShape).toBeNull();
    });
  });

  describe('openAnnotation', () => {
    it('should open annotation with node ID and image', () => {
      const { openAnnotation } = useAnnotationStore.getState();

      openAnnotation('node-123', 'https://example.com/image.png');

      const state = useAnnotationStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.nodeId).toBe('node-123');
      expect(state.sourceImage).toBe('https://example.com/image.png');
    });

    it('should reset state when opening', () => {
      useAnnotationStore.setState({
        isDrawing: true,
        selectedShapeId: 'some-shape',
      });

      const { openAnnotation } = useAnnotationStore.getState();
      openAnnotation('node-1', 'image.png');

      const state = useAnnotationStore.getState();
      expect(state.selectedShapeId).toBeNull();
      expect(state.isDrawing).toBe(false);
      expect(state.drawingShape).toBeNull();
    });

    it('should load existing shapes', () => {
      const existingShapes: AnnotationShape[] = [
        {
          fillColor: null,
          height: 50,
          id: 'shape-1',
          strokeColor: '#000',
          strokeWidth: 2,
          type: 'rectangle',
          width: 100,
          x: 10,
          y: 20,
        },
      ];

      const { openAnnotation } = useAnnotationStore.getState();
      openAnnotation('node-1', 'image.png', existingShapes);

      const state = useAnnotationStore.getState();
      expect(state.shapes).toHaveLength(1);
      expect(state.shapes[0].id).toBe('shape-1');
    });

    it('should initialize history with existing shapes', () => {
      const existingShapes: AnnotationShape[] = [
        {
          fillColor: null,
          id: 'shape-1',
          radius: 25,
          strokeColor: '#000',
          strokeWidth: 2,
          type: 'circle',
          x: 50,
          y: 50,
        },
      ];

      const { openAnnotation } = useAnnotationStore.getState();
      openAnnotation('node-1', 'image.png', existingShapes);

      const state = useAnnotationStore.getState();
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toEqual(existingShapes);
      expect(state.historyIndex).toBe(0);
    });

    it('should reset tool to rectangle', () => {
      useAnnotationStore.setState({ currentTool: 'arrow' });

      const { openAnnotation } = useAnnotationStore.getState();
      openAnnotation('node-1', 'image.png');

      expect(useAnnotationStore.getState().currentTool).toBe('rectangle');
    });
  });

  describe('closeAnnotation', () => {
    it('should close and reset all state', () => {
      useAnnotationStore.setState({
        history: [[{ id: 'shape-1', type: 'rectangle' } as RectangleShape]],
        historyIndex: 0,
        isOpen: true,
        nodeId: 'node-1',
        selectedShapeId: 'shape-1',
        shapes: [{ id: 'shape-1', type: 'rectangle' } as RectangleShape],
        sourceImage: 'image.png',
      });

      const { closeAnnotation } = useAnnotationStore.getState();
      closeAnnotation();

      const state = useAnnotationStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.nodeId).toBeNull();
      expect(state.sourceImage).toBeNull();
      expect(state.shapes).toEqual([]);
      expect(state.selectedShapeId).toBeNull();
      expect(state.history).toEqual([]);
      expect(state.historyIndex).toBe(-1);
    });
  });

  describe('saveAndClose', () => {
    it('should return shapes and node ID when saving', () => {
      const shapes: AnnotationShape[] = [
        {
          fillColor: null,
          height: 50,
          id: 'shape-1',
          strokeColor: '#000',
          strokeWidth: 2,
          type: 'rectangle',
          width: 100,
          x: 10,
          y: 20,
        },
      ];

      useAnnotationStore.setState({
        isOpen: true,
        nodeId: 'node-123',
        shapes,
      });

      const { saveAndClose } = useAnnotationStore.getState();
      const result = saveAndClose();

      expect(result).toEqual({
        nodeId: 'node-123',
        shapes,
      });
    });

    it('should close the annotation after saving', () => {
      useAnnotationStore.setState({
        isOpen: true,
        nodeId: 'node-1',
        shapes: [],
      });

      const { saveAndClose } = useAnnotationStore.getState();
      saveAndClose();

      expect(useAnnotationStore.getState().isOpen).toBe(false);
    });

    it('should return null if no node ID', () => {
      useAnnotationStore.setState({
        isOpen: true,
        nodeId: null,
      });

      const { saveAndClose } = useAnnotationStore.getState();
      const result = saveAndClose();

      expect(result).toBeNull();
    });
  });

  describe('addShape', () => {
    it('should add a shape to the list', () => {
      useAnnotationStore.setState({ history: [[]], historyIndex: 0 });

      const shape: RectangleShape = {
        fillColor: null,
        height: 50,
        id: 'shape-1',
        strokeColor: '#ff0000',
        strokeWidth: 3,
        type: 'rectangle',
        width: 100,
        x: 10,
        y: 20,
      };

      const { addShape } = useAnnotationStore.getState();
      addShape(shape);

      expect(useAnnotationStore.getState().shapes).toHaveLength(1);
      expect(useAnnotationStore.getState().shapes[0]).toEqual(shape);
    });

    it('should add shape to history', () => {
      useAnnotationStore.setState({ history: [[]], historyIndex: 0 });

      const shape: CircleShape = {
        fillColor: '#00ff0050',
        id: 'circle-1',
        radius: 50,
        strokeColor: '#00ff00',
        strokeWidth: 2,
        type: 'circle',
        x: 100,
        y: 100,
      };

      const { addShape } = useAnnotationStore.getState();
      addShape(shape);

      const state = useAnnotationStore.getState();
      expect(state.history).toHaveLength(2);
      expect(state.historyIndex).toBe(1);
    });

    it('should truncate future history when adding after undo', () => {
      useAnnotationStore.setState({
        history: [
          [],
          [{ id: 's1' } as AnnotationShape],
          [{ id: 's1' }, { id: 's2' }] as AnnotationShape[],
        ],
        historyIndex: 0,
        shapes: [],
      });

      const shape: ArrowShape = {
        fillColor: null,
        id: 'arrow-1',
        points: [0, 0, 100, 100],
        strokeColor: '#0000ff',
        strokeWidth: 2,
        type: 'arrow',
      };

      const { addShape } = useAnnotationStore.getState();
      addShape(shape);

      const state = useAnnotationStore.getState();
      expect(state.history).toHaveLength(2);
    });
  });

  describe('updateShape', () => {
    it('should update a shape', () => {
      const shape: RectangleShape = {
        fillColor: null,
        height: 50,
        id: 'shape-1',
        strokeColor: '#ff0000',
        strokeWidth: 3,
        type: 'rectangle',
        width: 100,
        x: 10,
        y: 20,
      };

      useAnnotationStore.setState({
        history: [[shape]],
        historyIndex: 0,
        shapes: [shape],
      });

      const { updateShape } = useAnnotationStore.getState();
      updateShape('shape-1', { height: 100, width: 200 });

      const state = useAnnotationStore.getState();
      const updated = state.shapes[0] as RectangleShape;
      expect(updated.width).toBe(200);
      expect(updated.height).toBe(100);
    });

    it('should add update to history', () => {
      const shape: CircleShape = {
        fillColor: null,
        id: 'circle-1',
        radius: 25,
        strokeColor: '#ff0000',
        strokeWidth: 3,
        type: 'circle',
        x: 50,
        y: 50,
      };

      useAnnotationStore.setState({
        history: [[shape]],
        historyIndex: 0,
        shapes: [shape],
      });

      const { updateShape } = useAnnotationStore.getState();
      updateShape('circle-1', { radius: 50 });

      expect(useAnnotationStore.getState().history).toHaveLength(2);
    });
  });

  describe('deleteShape', () => {
    it('should delete a shape', () => {
      const shapes: AnnotationShape[] = [
        { id: 'shape-1', type: 'rectangle' } as RectangleShape,
        { id: 'shape-2', type: 'circle' } as CircleShape,
      ];

      useAnnotationStore.setState({
        history: [shapes],
        historyIndex: 0,
        shapes,
      });

      const { deleteShape } = useAnnotationStore.getState();
      deleteShape('shape-1');

      expect(useAnnotationStore.getState().shapes).toHaveLength(1);
      expect(useAnnotationStore.getState().shapes[0].id).toBe('shape-2');
    });

    it('should clear selection if deleted shape was selected', () => {
      useAnnotationStore.setState({
        history: [[{ id: 'shape-1', type: 'rectangle' } as RectangleShape]],
        historyIndex: 0,
        selectedShapeId: 'shape-1',
        shapes: [{ id: 'shape-1', type: 'rectangle' } as RectangleShape],
      });

      const { deleteShape } = useAnnotationStore.getState();
      deleteShape('shape-1');

      expect(useAnnotationStore.getState().selectedShapeId).toBeNull();
    });

    it('should not clear selection if different shape deleted', () => {
      useAnnotationStore.setState({
        history: [[{ id: 'shape-1' }, { id: 'shape-2' }] as AnnotationShape[]],
        historyIndex: 0,
        selectedShapeId: 'shape-1',
        shapes: [
          { id: 'shape-1', type: 'rectangle' } as RectangleShape,
          { id: 'shape-2', type: 'circle' } as CircleShape,
        ],
      });

      const { deleteShape } = useAnnotationStore.getState();
      deleteShape('shape-2');

      expect(useAnnotationStore.getState().selectedShapeId).toBe('shape-1');
    });
  });

  describe('selectShape', () => {
    it('should select a shape', () => {
      const { selectShape } = useAnnotationStore.getState();

      selectShape('shape-123');

      expect(useAnnotationStore.getState().selectedShapeId).toBe('shape-123');
    });

    it('should clear selection with null', () => {
      useAnnotationStore.setState({ selectedShapeId: 'shape-1' });

      const { selectShape } = useAnnotationStore.getState();
      selectShape(null);

      expect(useAnnotationStore.getState().selectedShapeId).toBeNull();
    });
  });

  describe('clearShapes', () => {
    it('should clear all shapes', () => {
      useAnnotationStore.setState({
        history: [[{ id: 'shape-1' }, { id: 'shape-2' }] as AnnotationShape[]],
        historyIndex: 0,
        selectedShapeId: 'shape-1',
        shapes: [
          { id: 'shape-1', type: 'rectangle' } as RectangleShape,
          { id: 'shape-2', type: 'circle' } as CircleShape,
        ],
      });

      const { clearShapes } = useAnnotationStore.getState();
      clearShapes();

      const state = useAnnotationStore.getState();
      expect(state.shapes).toEqual([]);
      expect(state.selectedShapeId).toBeNull();
    });

    it('should add clear action to history', () => {
      useAnnotationStore.setState({
        history: [[{ id: 'shape-1' } as AnnotationShape]],
        historyIndex: 0,
        shapes: [{ id: 'shape-1', type: 'rectangle' } as RectangleShape],
      });

      const { clearShapes } = useAnnotationStore.getState();
      clearShapes();

      const state = useAnnotationStore.getState();
      expect(state.history).toHaveLength(2);
      expect(state.history[1]).toEqual([]);
    });
  });

  describe('setTool', () => {
    it('should set the current tool', () => {
      const tools: AnnotationTool[] = [
        'select',
        'rectangle',
        'circle',
        'arrow',
        'freehand',
        'text',
      ];

      for (const tool of tools) {
        const { setTool } = useAnnotationStore.getState();
        setTool(tool);
        expect(useAnnotationStore.getState().currentTool).toBe(tool);
      }
    });

    it('should clear selection when changing tool', () => {
      useAnnotationStore.setState({ selectedShapeId: 'shape-1' });

      const { setTool } = useAnnotationStore.getState();
      setTool('circle');

      expect(useAnnotationStore.getState().selectedShapeId).toBeNull();
    });
  });

  describe('setToolOptions', () => {
    it('should set stroke color', () => {
      const { setToolOptions } = useAnnotationStore.getState();

      setToolOptions({ strokeColor: '#00ff00' });

      expect(useAnnotationStore.getState().toolOptions.strokeColor).toBe('#00ff00');
    });

    it('should set stroke width', () => {
      const { setToolOptions } = useAnnotationStore.getState();

      setToolOptions({ strokeWidth: 5 });

      expect(useAnnotationStore.getState().toolOptions.strokeWidth).toBe(5);
    });

    it('should set fill color', () => {
      const { setToolOptions } = useAnnotationStore.getState();

      setToolOptions({ fillColor: '#ff000050' });

      expect(useAnnotationStore.getState().toolOptions.fillColor).toBe('#ff000050');
    });

    it('should set font size', () => {
      const { setToolOptions } = useAnnotationStore.getState();

      setToolOptions({ fontSize: 24 });

      expect(useAnnotationStore.getState().toolOptions.fontSize).toBe(24);
    });

    it('should merge with existing options', () => {
      const { setToolOptions } = useAnnotationStore.getState();

      setToolOptions({ strokeColor: '#0000ff' });
      setToolOptions({ strokeWidth: 8 });

      const options = useAnnotationStore.getState().toolOptions;
      expect(options.strokeColor).toBe('#0000ff');
      expect(options.strokeWidth).toBe(8);
    });
  });

  describe('drawing operations', () => {
    describe('startDrawing', () => {
      it('should start drawing with partial shape', () => {
        const { startDrawing } = useAnnotationStore.getState();

        startDrawing({
          strokeColor: '#ff0000',
          strokeWidth: 2,
          type: 'rectangle',
          x: 10,
          y: 20,
        });

        const state = useAnnotationStore.getState();
        expect(state.isDrawing).toBe(true);
        expect(state.drawingShape).toBeDefined();
        expect(state.drawingShape?.id).toMatch(/^shape-/);
        expect(state.drawingShape?.type).toBe('rectangle');
      });
    });

    describe('updateDrawing', () => {
      it('should update drawing shape', () => {
        useAnnotationStore.setState({
          drawingShape: {
            height: 30,
            id: 'drawing-1',
            type: 'rectangle',
            width: 50,
            x: 10,
            y: 20,
          },
          isDrawing: true,
        });

        const { updateDrawing } = useAnnotationStore.getState();
        updateDrawing({ height: 60, width: 100 });

        const shape = useAnnotationStore.getState().drawingShape as {
          width?: number;
          height?: number;
        } | null;
        expect(shape?.width).toBe(100);
        expect(shape?.height).toBe(60);
      });

      it('should do nothing if not drawing', () => {
        const { updateDrawing } = useAnnotationStore.getState();
        updateDrawing({ width: 100 });

        expect(useAnnotationStore.getState().drawingShape).toBeNull();
      });
    });

    describe('finishDrawing', () => {
      it('should add valid rectangle shape', () => {
        useAnnotationStore.setState({
          drawingShape: {
            fillColor: null,
            height: 50,
            id: 'rect-1',
            strokeColor: '#ff0000',
            strokeWidth: 2,
            type: 'rectangle',
            width: 100,
            x: 10,
            y: 20,
          },
          history: [[]],
          historyIndex: 0,
          isDrawing: true,
        });

        const { finishDrawing } = useAnnotationStore.getState();
        finishDrawing();

        const state = useAnnotationStore.getState();
        expect(state.isDrawing).toBe(false);
        expect(state.drawingShape).toBeNull();
        expect(state.shapes).toHaveLength(1);
      });

      it('should not add invalid rectangle (too small)', () => {
        useAnnotationStore.setState({
          drawingShape: {
            fillColor: null,
            height: 3, // Too small
            id: 'rect-1',
            strokeColor: '#ff0000',
            strokeWidth: 2,
            type: 'rectangle',
            width: 3, // Too small
            x: 10,
            y: 20,
          },
          history: [[]],
          historyIndex: 0,
          isDrawing: true,
          shapes: [],
        });

        const { finishDrawing } = useAnnotationStore.getState();
        finishDrawing();

        expect(useAnnotationStore.getState().shapes).toHaveLength(0);
      });

      it('should add valid circle shape', () => {
        useAnnotationStore.setState({
          drawingShape: {
            fillColor: null,
            id: 'circle-1',
            radius: 25,
            strokeColor: '#ff0000',
            strokeWidth: 2,
            type: 'circle',
            x: 50,
            y: 50,
          },
          history: [[]],
          historyIndex: 0,
          isDrawing: true,
        });

        const { finishDrawing } = useAnnotationStore.getState();
        finishDrawing();

        expect(useAnnotationStore.getState().shapes).toHaveLength(1);
      });

      it('should not add invalid circle (radius too small)', () => {
        useAnnotationStore.setState({
          drawingShape: {
            fillColor: null,
            id: 'circle-1',
            radius: 3, // Too small
            strokeColor: '#ff0000',
            strokeWidth: 2,
            type: 'circle',
            x: 50,
            y: 50,
          },
          history: [[]],
          historyIndex: 0,
          isDrawing: true,
          shapes: [],
        });

        const { finishDrawing } = useAnnotationStore.getState();
        finishDrawing();

        expect(useAnnotationStore.getState().shapes).toHaveLength(0);
      });

      it('should add valid arrow shape', () => {
        useAnnotationStore.setState({
          drawingShape: {
            fillColor: null,
            id: 'arrow-1',
            points: [0, 0, 100, 100],
            strokeColor: '#ff0000',
            strokeWidth: 2,
            type: 'arrow',
          },
          history: [[]],
          historyIndex: 0,
          isDrawing: true,
        });

        const { finishDrawing } = useAnnotationStore.getState();
        finishDrawing();

        expect(useAnnotationStore.getState().shapes).toHaveLength(1);
      });

      it('should not add invalid arrow (too short)', () => {
        useAnnotationStore.setState({
          drawingShape: {
            fillColor: null,
            id: 'arrow-1',
            points: [0, 0, 5, 5], // Too short
            strokeColor: '#ff0000',
            strokeWidth: 2,
            type: 'arrow',
          },
          history: [[]],
          historyIndex: 0,
          isDrawing: true,
          shapes: [],
        });

        const { finishDrawing } = useAnnotationStore.getState();
        finishDrawing();

        expect(useAnnotationStore.getState().shapes).toHaveLength(0);
      });

      it('should add valid freehand shape', () => {
        useAnnotationStore.setState({
          drawingShape: {
            fillColor: null,
            id: 'freehand-1',
            points: [0, 0, 10, 10, 20, 20, 30, 30],
            strokeColor: '#ff0000',
            strokeWidth: 2,
            type: 'freehand',
          },
          history: [[]],
          historyIndex: 0,
          isDrawing: true,
        });

        const { finishDrawing } = useAnnotationStore.getState();
        finishDrawing();

        expect(useAnnotationStore.getState().shapes).toHaveLength(1);
      });

      it('should add valid text shape', () => {
        useAnnotationStore.setState({
          drawingShape: {
            fillColor: null,
            fontSize: 16,
            id: 'text-1',
            strokeColor: '#ff0000',
            strokeWidth: 2,
            text: 'Hello World',
            type: 'text',
            x: 100,
            y: 100,
          },
          history: [[]],
          historyIndex: 0,
          isDrawing: true,
        });

        const { finishDrawing } = useAnnotationStore.getState();
        finishDrawing();

        expect(useAnnotationStore.getState().shapes).toHaveLength(1);
      });

      it('should not add invalid text (empty)', () => {
        useAnnotationStore.setState({
          drawingShape: {
            fillColor: null,
            fontSize: 16,
            id: 'text-1',
            strokeColor: '#ff0000',
            strokeWidth: 2,
            text: '',
            type: 'text',
            x: 100,
            y: 100,
          },
          history: [[]],
          historyIndex: 0,
          isDrawing: true,
          shapes: [],
        });

        const { finishDrawing } = useAnnotationStore.getState();
        finishDrawing();

        expect(useAnnotationStore.getState().shapes).toHaveLength(0);
      });
    });

    describe('cancelDrawing', () => {
      it('should cancel drawing without adding shape', () => {
        useAnnotationStore.setState({
          drawingShape: {
            height: 50,
            id: 'rect-1',
            type: 'rectangle',
            width: 100,
            x: 10,
            y: 20,
          },
          isDrawing: true,
          shapes: [],
        });

        const { cancelDrawing } = useAnnotationStore.getState();
        cancelDrawing();

        const state = useAnnotationStore.getState();
        expect(state.isDrawing).toBe(false);
        expect(state.drawingShape).toBeNull();
        expect(state.shapes).toHaveLength(0);
      });
    });
  });

  describe('history operations', () => {
    describe('undo', () => {
      it('should undo to previous state', () => {
        const shape1: RectangleShape = {
          fillColor: null,
          height: 50,
          id: 'shape-1',
          strokeColor: '#000',
          strokeWidth: 2,
          type: 'rectangle',
          width: 100,
          x: 10,
          y: 20,
        };

        useAnnotationStore.setState({
          history: [[], [shape1]],
          historyIndex: 1,
          shapes: [shape1],
        });

        const { undo } = useAnnotationStore.getState();
        undo();

        const state = useAnnotationStore.getState();
        expect(state.shapes).toEqual([]);
        expect(state.historyIndex).toBe(0);
      });

      it('should clear selection after undo', () => {
        useAnnotationStore.setState({
          history: [[], [{ id: 'shape-1' } as AnnotationShape]],
          historyIndex: 1,
          selectedShapeId: 'shape-1',
          shapes: [{ id: 'shape-1' } as AnnotationShape],
        });

        const { undo } = useAnnotationStore.getState();
        undo();

        expect(useAnnotationStore.getState().selectedShapeId).toBeNull();
      });

      it('should not undo past beginning', () => {
        useAnnotationStore.setState({
          history: [[]],
          historyIndex: 0,
          shapes: [],
        });

        const { undo } = useAnnotationStore.getState();
        undo();

        expect(useAnnotationStore.getState().historyIndex).toBe(0);
      });
    });

    describe('redo', () => {
      it('should redo to next state', () => {
        const shape1: CircleShape = {
          fillColor: null,
          id: 'shape-1',
          radius: 25,
          strokeColor: '#000',
          strokeWidth: 2,
          type: 'circle',
          x: 50,
          y: 50,
        };

        useAnnotationStore.setState({
          history: [[], [shape1]],
          historyIndex: 0,
          shapes: [],
        });

        const { redo } = useAnnotationStore.getState();
        redo();

        const state = useAnnotationStore.getState();
        expect(state.shapes).toHaveLength(1);
        expect(state.historyIndex).toBe(1);
      });

      it('should not redo past end', () => {
        useAnnotationStore.setState({
          history: [[], [{ id: 'shape-1' } as AnnotationShape]],
          historyIndex: 1,
          shapes: [{ id: 'shape-1' } as AnnotationShape],
        });

        const { redo } = useAnnotationStore.getState();
        redo();

        expect(useAnnotationStore.getState().historyIndex).toBe(1);
      });
    });

    describe('canUndo', () => {
      it('should return true when can undo', () => {
        useAnnotationStore.setState({
          history: [[], [{ id: 'shape-1' } as AnnotationShape]],
          historyIndex: 1,
        });

        const { canUndo } = useAnnotationStore.getState();
        expect(canUndo()).toBe(true);
      });

      it('should return false at beginning', () => {
        useAnnotationStore.setState({
          history: [[]],
          historyIndex: 0,
        });

        const { canUndo } = useAnnotationStore.getState();
        expect(canUndo()).toBe(false);
      });
    });

    describe('canRedo', () => {
      it('should return true when can redo', () => {
        useAnnotationStore.setState({
          history: [[], [{ id: 'shape-1' } as AnnotationShape]],
          historyIndex: 0,
        });

        const { canRedo } = useAnnotationStore.getState();
        expect(canRedo()).toBe(true);
      });

      it('should return false at end', () => {
        useAnnotationStore.setState({
          history: [[], [{ id: 'shape-1' } as AnnotationShape]],
          historyIndex: 1,
        });

        const { canRedo } = useAnnotationStore.getState();
        expect(canRedo()).toBe(false);
      });
    });
  });

  describe('history limit', () => {
    it('should limit history to MAX_HISTORY (50)', () => {
      useAnnotationStore.setState({
        history: [[]],
        historyIndex: 0,
        shapes: [],
      });

      const { addShape } = useAnnotationStore.getState();

      // Add 60 shapes (exceeds MAX_HISTORY of 50)
      for (let i = 0; i < 60; i++) {
        addShape({
          fillColor: null,
          height: 50,
          id: `shape-${i}`,
          strokeColor: '#000',
          strokeWidth: 2,
          type: 'rectangle',
          width: 50,
          x: i * 10,
          y: i * 10,
        });
      }

      const state = useAnnotationStore.getState();
      expect(state.history.length).toBeLessThanOrEqual(50);
    });
  });
});
