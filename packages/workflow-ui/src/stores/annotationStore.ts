import { create } from 'zustand';

// =============================================================================
// TYPES
// =============================================================================

export type AnnotationTool =
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'arrow'
  | 'freehand'
  | 'text';

export interface ToolOptions {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string | null;
  fontSize: number;
}

export interface BaseShape {
  id: string;
  type: AnnotationTool;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string | null;
}

export interface RectangleShape extends BaseShape {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleShape extends BaseShape {
  type: 'circle';
  x: number;
  y: number;
  radius: number;
}

export interface ArrowShape extends BaseShape {
  type: 'arrow';
  points: number[]; // [x1, y1, x2, y2]
}

export interface FreehandShape extends BaseShape {
  type: 'freehand';
  points: number[]; // Flattened array of [x, y] pairs
}

export interface TextShape extends BaseShape {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type AnnotationShape =
  | RectangleShape
  | CircleShape
  | ArrowShape
  | FreehandShape
  | TextShape;

// =============================================================================
// STORE
// =============================================================================

interface AnnotationStore {
  // State
  isOpen: boolean;
  nodeId: string | null;
  sourceImage: string | null;
  shapes: AnnotationShape[];
  selectedShapeId: string | null;
  currentTool: AnnotationTool;
  toolOptions: ToolOptions;

  // History for undo/redo
  history: AnnotationShape[][];
  historyIndex: number;

  // Drawing state
  isDrawing: boolean;
  drawingShape: Partial<AnnotationShape> | null;

  // Actions
  openAnnotation: (
    nodeId: string,
    image: string,
    existingShapes?: AnnotationShape[],
  ) => void;
  closeAnnotation: () => void;
  saveAndClose: () => { nodeId: string; shapes: AnnotationShape[] } | null;

  // Shape operations
  addShape: (shape: AnnotationShape) => void;
  updateShape: (id: string, updates: Partial<AnnotationShape>) => void;
  deleteShape: (id: string) => void;
  selectShape: (id: string | null) => void;
  clearShapes: () => void;

  // Tool operations
  setTool: (tool: AnnotationTool) => void;
  setToolOptions: (options: Partial<ToolOptions>) => void;

  // Drawing operations
  startDrawing: (shape: Partial<AnnotationShape>) => void;
  updateDrawing: (updates: Partial<AnnotationShape>) => void;
  finishDrawing: () => void;
  cancelDrawing: () => void;

  // History operations
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  fillColor: null,
  fontSize: 16,
  strokeColor: '#ef4444', // Red
  strokeWidth: 3,
};

const MAX_HISTORY = 50;

let shapeIdCounter = 0;
function generateShapeId(): string {
  return `shape-${Date.now()}-${++shapeIdCounter}`;
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  addShape: (shape) => {
    set((state) => {
      const newShapes = [...state.shapes, shape];
      const newHistory = [
        ...state.history.slice(0, state.historyIndex + 1),
        newShapes,
      ].slice(-MAX_HISTORY);
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
        shapes: newShapes,
      };
    });
  },

  cancelDrawing: () => {
    set({ drawingShape: null, isDrawing: false });
  },

  canRedo: () => {
    const { historyIndex, history } = get();
    return historyIndex < history.length - 1;
  },

  canUndo: () => {
    const { historyIndex } = get();
    return historyIndex > 0;
  },

  clearShapes: () => {
    set((state) => {
      const newHistory = [
        ...state.history.slice(0, state.historyIndex + 1),
        [],
      ].slice(-MAX_HISTORY);
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
        selectedShapeId: null,
        shapes: [],
      };
    });
  },

  closeAnnotation: () => {
    set({
      drawingShape: null,
      history: [],
      historyIndex: -1,
      isDrawing: false,
      isOpen: false,
      nodeId: null,
      selectedShapeId: null,
      shapes: [],
      sourceImage: null,
    });
  },
  currentTool: 'rectangle',

  deleteShape: (id) => {
    set((state) => {
      const newShapes = state.shapes.filter((s) => s.id !== id);
      const newHistory = [
        ...state.history.slice(0, state.historyIndex + 1),
        newShapes,
      ].slice(-MAX_HISTORY);
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
        selectedShapeId:
          state.selectedShapeId === id ? null : state.selectedShapeId,
        shapes: newShapes,
      };
    });
  },
  drawingShape: null,

  finishDrawing: () => {
    const { drawingShape, addShape } = get();
    if (drawingShape && isValidShape(drawingShape)) {
      addShape(drawingShape as AnnotationShape);
    }
    set({ drawingShape: null, isDrawing: false });
  },
  history: [],
  historyIndex: -1,
  isDrawing: false,
  isOpen: false,
  nodeId: null,

  openAnnotation: (nodeId, image, existingShapes = []) => {
    set({
      currentTool: 'rectangle',
      drawingShape: null,
      history: [existingShapes],
      historyIndex: 0,
      isDrawing: false,
      isOpen: true,
      nodeId,
      selectedShapeId: null,
      shapes: existingShapes,
      sourceImage: image,
      toolOptions: DEFAULT_TOOL_OPTIONS,
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex < state.history.length - 1) {
        const newIndex = state.historyIndex + 1;
        return {
          historyIndex: newIndex,
          selectedShapeId: null,
          shapes: state.history[newIndex],
        };
      }
      return state;
    });
  },

  saveAndClose: () => {
    const { nodeId, shapes } = get();
    if (!nodeId) return null;

    const result = { nodeId, shapes: [...shapes] };

    set({
      drawingShape: null,
      history: [],
      historyIndex: -1,
      isDrawing: false,
      isOpen: false,
      nodeId: null,
      selectedShapeId: null,
      shapes: [],
      sourceImage: null,
    });

    return result;
  },
  selectedShapeId: null,

  selectShape: (id) => {
    set({ selectedShapeId: id });
  },

  setTool: (tool) => {
    set({ currentTool: tool, selectedShapeId: null });
  },

  setToolOptions: (options) => {
    set((state) => ({
      toolOptions: { ...state.toolOptions, ...options },
    }));
  },
  shapes: [],
  sourceImage: null,

  startDrawing: (shape) => {
    set({
      drawingShape: {
        id: generateShapeId(),
        ...shape,
      },
      isDrawing: true,
    });
  },
  toolOptions: DEFAULT_TOOL_OPTIONS,

  undo: () => {
    set((state) => {
      if (state.historyIndex > 0) {
        const newIndex = state.historyIndex - 1;
        return {
          historyIndex: newIndex,
          selectedShapeId: null,
          shapes: state.history[newIndex],
        };
      }
      return state;
    });
  },

  updateDrawing: (updates) => {
    set((state) => ({
      drawingShape: state.drawingShape
        ? { ...state.drawingShape, ...updates }
        : null,
    }));
  },

  updateShape: (id, updates) => {
    set((state) => {
      const newShapes = state.shapes.map((s) =>
        s.id === id ? ({ ...s, ...updates } as AnnotationShape) : s,
      );
      const newHistory = [
        ...state.history.slice(0, state.historyIndex + 1),
        newShapes,
      ].slice(-MAX_HISTORY);
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
        shapes: newShapes,
      };
    });
  },
}));

// Validate that a shape has all required properties
function isValidShape(shape: Partial<AnnotationShape>): boolean {
  if (!shape.id || !shape.type) return false;

  switch (shape.type) {
    case 'rectangle':
      return (
        typeof shape.x === 'number' &&
        typeof shape.y === 'number' &&
        typeof shape.width === 'number' &&
        typeof shape.height === 'number' &&
        Math.abs(shape.width) > 5 &&
        Math.abs(shape.height) > 5
      );
    case 'circle':
      return (
        typeof shape.x === 'number' &&
        typeof shape.y === 'number' &&
        typeof shape.radius === 'number' &&
        shape.radius > 5
      );
    case 'arrow':
      return (
        Array.isArray(shape.points) &&
        shape.points.length >= 4 &&
        Math.hypot(
          shape.points[2] - shape.points[0],
          shape.points[3] - shape.points[1],
        ) > 10
      );
    case 'freehand':
      return Array.isArray(shape.points) && shape.points.length >= 4;
    case 'text':
      return (
        typeof shape.x === 'number' &&
        typeof shape.y === 'number' &&
        typeof shape.text === 'string' &&
        shape.text.length > 0
      );
    default:
      return false;
  }
}
