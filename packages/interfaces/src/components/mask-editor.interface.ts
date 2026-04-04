import type { IIngredient } from '../index';

export interface IMaskEditorProps {
  ingredient: IIngredient;
  onSave: (maskDataUrl: string) => void;
  onCancel: () => void;
  className?: string;
}

export interface IMaskDrawingState {
  isDrawing: boolean;
  brushSize: number;
  brushOpacity: number;
  tool: 'brush' | 'eraser';
  history: ImageData[];
  historyIndex: number;
}

export interface IMaskToolbarProps {
  brushSize: number;
  brushOpacity: number;
  tool: 'brush' | 'eraser';
  onBrushSizeChange: (size: number) => void;
  onBrushOpacityChange: (opacity: number) => void;
  onToolChange: (tool: 'brush' | 'eraser') => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export interface IMaskCanvasProps {
  imageUrl: string;
  brushSize: number;
  brushOpacity: number;
  tool: 'brush' | 'eraser';
  onCanvasReady: (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ) => void;
  onDrawingChange: () => void;
}
