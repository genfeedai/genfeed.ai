'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  IMaskDrawingState,
  IMaskEditorProps,
} from '@genfeedai/interfaces/components/mask-editor.interface';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import FormRange from '@ui/forms/selectors/range/form-range/FormRange';
import type { MouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiArrowPath,
  HiArrowUturnLeft,
  HiArrowUturnRight,
  HiCheck,
  HiPaintBrush,
  HiTrash,
  HiXMark,
} from 'react-icons/hi2';

type ToolType = 'brush' | 'eraser';

const TOOL_CONFIG = {
  brush: { icon: <HiPaintBrush />, label: 'Brush', tooltip: 'Brush' },
  eraser: { icon: <HiArrowPath />, label: 'Eraser', tooltip: 'Eraser' },
} as const;

const HISTORY_MAX_SIZE = 20;

export default function MaskEditor({
  ingredient,
  onSave,
  onCancel,
  className = '',
}: IMaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<IMaskDrawingState>({
    brushOpacity: 100,
    brushSize: 20,
    history: [],
    historyIndex: -1,
    isDrawing: false,
    tool: 'brush',
  });

  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const saveToHistory = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const ctx = maskCanvas?.getContext('2d');
    if (!ctx || !maskCanvas) {
      return;
    }

    const imageData = ctx.getImageData(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height,
    );

    setState((prev) => {
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push(imageData);

      if (newHistory.length > HISTORY_MAX_SIZE) {
        newHistory.shift();
      }

      return {
        ...prev,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  }, []);

  const initializeCanvases = useCallback(
    (img: HTMLImageElement) => {
      const canvas = canvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      if (!canvas || !maskCanvas) {
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      maskCanvas.width = img.width;
      maskCanvas.height = img.height;

      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);

      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        saveToHistory();
      }
    },
    [saveToHistory],
  );

  useEffect(() => {
    const imageUrl = ingredient.ingredientUrl || ingredient.thumbnailUrl;
    if (!imageUrl) {
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
      initializeCanvases(img);
    };

    img.src = imageUrl;

    return () => {
      img.onload = null;
    };
  }, [ingredient, initializeCanvases]);

  const handleUndo = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const ctx = maskCanvas?.getContext('2d');
    if (!ctx || !maskCanvas || state.historyIndex <= 0) {
      return;
    }

    const newIndex = state.historyIndex - 1;
    ctx.putImageData(state.history[newIndex], 0, 0);
    setState((prev) => ({ ...prev, historyIndex: newIndex }));
  }, [state.history, state.historyIndex]);

  const handleRedo = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const ctx = maskCanvas?.getContext('2d');
    if (!ctx || !maskCanvas || state.historyIndex >= state.history.length - 1) {
      return;
    }

    const newIndex = state.historyIndex + 1;
    ctx.putImageData(state.history[newIndex], 0, 0);
    setState((prev) => ({ ...prev, historyIndex: newIndex }));
  }, [state.history, state.historyIndex]);

  const handleClear = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const ctx = maskCanvas?.getContext('2d');
    if (!ctx || !maskCanvas) {
      return;
    }

    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    saveToHistory();
  }, [saveToHistory]);

  const draw = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      if (!state.isDrawing && e.type !== 'mousedown') {
        return;
      }

      const maskCanvas = maskCanvasRef.current;
      const ctx = maskCanvas?.getContext('2d');
      if (!ctx || !maskCanvas) {
        return;
      }

      const rect = maskCanvas.getBoundingClientRect();
      const scaleX = maskCanvas.width / rect.width;
      const scaleY = maskCanvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      ctx.globalCompositeOperation =
        state.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.fillStyle = `rgba(255, 255, 255, ${state.brushOpacity / 100})`;
      ctx.beginPath();
      ctx.arc(x, y, state.brushSize, 0, 2 * Math.PI);
      ctx.fill();
    },
    [state.isDrawing, state.tool, state.brushSize, state.brushOpacity],
  );

  const startDrawing = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      setState((prev) => ({ ...prev, isDrawing: true }));
      draw(e);
    },
    [draw],
  );

  const stopDrawing = useCallback(() => {
    if (state.isDrawing) {
      saveToHistory();
    }
    setState((prev) => ({ ...prev, isDrawing: false }));
  }, [state.isDrawing, saveToHistory]);

  const handleSave = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const ctx = maskCanvas?.getContext('2d');
    if (!ctx || !maskCanvas) {
      return;
    }

    const imageData = ctx.getImageData(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height,
    );
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const value = data[i + 3] > 0 ? 255 : 0;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    onSave(maskCanvas.toDataURL('image/png'));
  }, [onSave]);

  if (!imageLoaded) {
    return (
      <Card className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center">
          <div className="mb-4">
            <div className="w-12 h-12 rounded-full bg-muted animate-pulse mx-auto" />
          </div>
          <p className="text-foreground/70">Loading image...</p>
        </div>
      </Card>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {(
                Object.entries(TOOL_CONFIG) as [
                  ToolType,
                  (typeof TOOL_CONFIG)[ToolType],
                ][]
              ).map(([tool, config]) => (
                <Button
                  key={tool}
                  onClick={() => setState((prev) => ({ ...prev, tool }))}
                  variant={
                    state.tool === tool
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.GHOST
                  }
                  size={ButtonSize.SM}
                  tooltip={config.tooltip}
                  icon={config.icon}
                  label={config.label}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm">Size</span>
              <div className="w-24">
                <FormRange
                  name="brushSize"
                  value={state.brushSize}
                  min={5}
                  max={100}
                  step={1}
                  className="range-xs"
                  showValue={false}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      brushSize: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <span className="text-sm w-8">{state.brushSize}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm">Opacity</span>
              <div className="w-24">
                <FormRange
                  name="brushOpacity"
                  value={state.brushOpacity}
                  min={10}
                  max={100}
                  step={10}
                  className="range-xs"
                  showValue={false}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      brushOpacity: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <span className="text-sm w-12">{state.brushOpacity}%</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleUndo}
              isDisabled={state.historyIndex <= 0}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              tooltip="Undo"
              icon={<HiArrowUturnLeft />}
              label="Undo"
            />
            <Button
              onClick={handleRedo}
              isDisabled={state.historyIndex >= state.history.length - 1}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              tooltip="Redo"
              icon={<HiArrowUturnRight />}
              label="Redo"
            />
            <Button
              onClick={handleClear}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              tooltip="Clear All"
              icon={<HiTrash />}
              label="Clear All"
            />

            <div className="border-l border-white/[0.08] h-6 mx-1" />

            <Button
              onClick={onCancel}
              variant={ButtonVariant.SECONDARY}
              icon={<HiXMark />}
              label="Cancel"
            />
            <Button
              onClick={handleSave}
              variant={ButtonVariant.DEFAULT}
              icon={<HiCheck />}
              label="Save Mask"
            />
          </div>
        </div>
      </Card>

      <Card className="relative overflow-hidden">
        <div className="relative inline-block">
          <canvas
            ref={canvasRef}
            className="block max-w-full h-auto"
            style={{ maxHeight: '70vh' }}
          />
          <canvas
            ref={maskCanvasRef}
            className="absolute top-0 left-0 opacity-50 cursor-crosshair"
            style={{ maxHeight: '70vh', mixBlendMode: 'screen' }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
        </div>
      </Card>

      <Card className="p-4 bg-background">
        <div className="text-sm space-y-1">
          <p className="font-semibold">Instructions</p>
          <ul className="list-disc list-inside space-y-1 text-foreground/70 dark:text-foreground/70">
            <li>Use the brush to paint over areas you want to modify</li>
            <li>Use the eraser to remove painted areas</li>
            <li>Adjust brush size and opacity for fine control</li>
            <li>
              White areas will be inpainted, black areas will remain unchanged
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
