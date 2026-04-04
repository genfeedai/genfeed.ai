'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AnnotationShape } from '@genfeedai/workflow-ui/stores';
import { useAnnotationStore } from '@genfeedai/workflow-ui/stores';
import { useWorkflowStore } from '@/store/workflowStore';
import { AnnotationOptionsPanel } from './AnnotationOptionsPanel';
import { AnnotationToolbar } from './AnnotationToolbar';
import { type CanvasState, drawShape, isPointInShape } from './drawing/shapes';

function AnnotationModalComponent() {
  const {
    isOpen,
    sourceImage,
    shapes,
    selectedShapeId,
    currentTool,
    toolOptions,
    isDrawing,
    drawingShape,
    closeAnnotation,
    saveAndClose,
    setTool,
    setToolOptions,
    startDrawing,
    updateDrawing,
    finishDrawing,
    selectShape,
    deleteShape,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useAnnotationStore();

  const { updateNodeData } = useWorkflowStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);

  // Load image and initialize canvas
  useEffect(() => {
    if (!sourceImage || !canvasRef.current || !containerRef.current) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);

      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const scale = Math.min(containerWidth / img.width, containerHeight / img.height, 1);
      const offsetX = (containerWidth - img.width * scale) / 2;
      const offsetY = (containerHeight - img.height * scale) / 2;

      setCanvasState({ offsetX, offsetY, scale });

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = containerWidth;
        canvas.height = containerHeight;
      }
    };
    img.src = sourceImage;

    return () => {
      imageRef.current = null;
      setImageLoaded(false);
    };
  }, [sourceImage]);

  // Render canvas
  useEffect(() => {
    if (!canvasRef.current || !imageLoaded || !imageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvasState.offsetX, canvasState.offsetY);
    ctx.scale(canvasState.scale, canvasState.scale);
    ctx.drawImage(imageRef.current, 0, 0);

    for (const shape of shapes) {
      drawShape(ctx, shape, shape.id === selectedShapeId);
    }

    if (isDrawing && drawingShape) {
      drawShape(ctx, drawingShape);
    }

    ctx.restore();
  }, [shapes, selectedShapeId, isDrawing, drawingShape, canvasState, imageLoaded]);

  // Convert screen coordinates to image coordinates
  const screenToImage = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (clientX - rect.left - canvasState.offsetX) / canvasState.scale;
      const y = (clientY - rect.top - canvasState.offsetY) / canvasState.scale;
      return { x, y };
    },
    [canvasState]
  );

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = screenToImage(e.clientX, e.clientY);

      if (currentTool === 'select') {
        for (let i = shapes.length - 1; i >= 0; i--) {
          if (isPointInShape(x, y, shapes[i])) {
            selectShape(shapes[i].id);
            return;
          }
        }
        selectShape(null);
        return;
      }

      if (currentTool === 'text') {
        setTextPosition({ x, y });
        return;
      }

      const baseShape = {
        fillColor: toolOptions.fillColor,
        strokeColor: toolOptions.strokeColor,
        strokeWidth: toolOptions.strokeWidth,
        type: currentTool,
      };

      switch (currentTool) {
        case 'rectangle':
          startDrawing({ ...baseShape, height: 0, type: 'rectangle', width: 0, x, y });
          break;
        case 'circle':
          startDrawing({ ...baseShape, radius: 0, type: 'circle', x, y });
          break;
        case 'arrow':
          startDrawing({ ...baseShape, points: [x, y, x, y], type: 'arrow' });
          break;
        case 'freehand':
          startDrawing({ ...baseShape, points: [x, y], type: 'freehand' });
          break;
      }
    },
    [currentTool, toolOptions, shapes, screenToImage, startDrawing, selectShape]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || !drawingShape) return;

      const { x, y } = screenToImage(e.clientX, e.clientY);

      switch (drawingShape.type) {
        case 'rectangle': {
          const startX = (drawingShape as { x: number }).x;
          const startY = (drawingShape as { y: number }).y;
          updateDrawing({ height: y - startY, width: x - startX });
          break;
        }
        case 'circle': {
          const startX = (drawingShape as { x: number }).x;
          const startY = (drawingShape as { y: number }).y;
          updateDrawing({ radius: Math.hypot(x - startX, y - startY) });
          break;
        }
        case 'arrow': {
          const points = (drawingShape as { points: number[] }).points;
          updateDrawing({ points: [points[0], points[1], x, y] });
          break;
        }
        case 'freehand': {
          const points = (drawingShape as { points: number[] }).points ?? [];
          updateDrawing({ points: [...points, x, y] });
          break;
        }
      }
    },
    [isDrawing, drawingShape, screenToImage, updateDrawing]
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      finishDrawing();
    }
  }, [isDrawing, finishDrawing]);

  // Text input handler
  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim() || !textPosition) return;

    const shape: AnnotationShape = {
      fillColor: null,
      fontSize: toolOptions.fontSize,
      id: `text-${Date.now()}`,
      strokeColor: toolOptions.strokeColor,
      strokeWidth: toolOptions.strokeWidth,
      text: textInput,
      type: 'text',
      x: textPosition.x,
      y: textPosition.y,
    };

    useAnnotationStore.getState().addShape(shape);
    setTextInput('');
    setTextPosition(null);
  }, [textInput, textPosition, toolOptions]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      if (e.key === 'z' && isMod && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      if ((e.key === 'z' && isMod && e.shiftKey) || (e.key === 'y' && isMod)) {
        e.preventDefault();
        redo();
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId && !textPosition) {
        e.preventDefault();
        deleteShape(selectedShapeId);
      }

      if (e.key === 'Escape') {
        if (textPosition) {
          setTextPosition(null);
          setTextInput('');
        } else if (selectedShapeId) {
          selectShape(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedShapeId, textPosition, undo, redo, deleteShape, selectShape]);

  // Handle save
  const handleSave = useCallback(() => {
    const result = saveAndClose();
    if (result) {
      updateNodeData(result.nodeId, {
        annotations: result.shapes,
        hasAnnotations: result.shapes.length > 0,
      });
    }
  }, [saveAndClose, updateNodeData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <h2 className="text-lg font-semibold text-foreground">Edit Annotations</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={closeAnnotation}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Annotations</Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        <AnnotationToolbar
          currentTool={currentTool}
          selectedShapeId={selectedShapeId}
          canUndo={canUndo()}
          canRedo={canRedo()}
          onToolSelect={setTool}
          onUndo={undo}
          onRedo={redo}
          onDelete={() => selectedShapeId && deleteShape(selectedShapeId)}
        />

        {/* Canvas */}
        <div ref={containerRef} className="relative flex-1 overflow-hidden bg-neutral-900">
          <canvas
            ref={canvasRef}
            className="cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

          {/* Text input overlay */}
          {textPosition && (
            <div
              className="absolute"
              style={{
                left: textPosition.x * canvasState.scale + canvasState.offsetX,
                top: textPosition.y * canvasState.scale + canvasState.offsetY,
              }}
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTextSubmit();
                  if (e.key === 'Escape') {
                    setTextPosition(null);
                    setTextInput('');
                  }
                }}
                className="rounded border border-primary bg-black/50 px-2 py-1 text-white outline-none"
                style={{
                  color: toolOptions.strokeColor,
                  fontSize: toolOptions.fontSize,
                }}
                placeholder="Type text..."
              />
            </div>
          )}
        </div>

        {/* Options Panel */}
        <AnnotationOptionsPanel
          currentTool={currentTool}
          toolOptions={toolOptions}
          onOptionsChange={setToolOptions}
        />
      </div>
    </div>
  );
}

export const AnnotationModal = memo(AnnotationModalComponent);
