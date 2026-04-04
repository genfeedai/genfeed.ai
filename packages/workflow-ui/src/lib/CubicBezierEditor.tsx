'use client';

import type { CubicBezier } from '@genfeedai/types';
import { memo, useCallback, useRef, useState } from 'react';

interface CubicBezierEditorProps {
  value: CubicBezier;
  onChange: (value: CubicBezier) => void;
  onCommit?: (value: CubicBezier) => void;
  disabled?: boolean;
  width?: number;
  height?: number;
}

const PADDING = 16;
const POINT_RADIUS = 8;

function CubicBezierEditorComponent({
  value,
  onChange,
  onCommit,
  disabled = false,
  width = 240,
  height = 240,
}: CubicBezierEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<1 | 2 | null>(null);

  const plotW = width - PADDING * 2;
  const plotH = height - PADDING * 2;

  // Convert bezier values (0-1 range) to SVG coordinates
  const toSVG = useCallback(
    (x: number, y: number): [number, number] => [
      PADDING + x * plotW,
      PADDING + (1 - y) * plotH,
    ],
    [plotW, plotH],
  );

  // Convert SVG coordinates to bezier values (0-1 range)
  const fromSVG = useCallback(
    (svgX: number, svgY: number): [number, number] => {
      const x = Math.max(0, Math.min(1, (svgX - PADDING) / plotW));
      const y = Math.max(-0.5, Math.min(1.5, 1 - (svgY - PADDING) / plotH));
      return [x, y];
    },
    [plotW, plotH],
  );

  const getSVGPoint = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): [number, number] => {
      const svg = svgRef.current;
      if (!svg) return [0, 0];
      const rect = svg.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    },
    [],
  );

  const handlePointerDown = useCallback(
    (point: 1 | 2) => (e: React.PointerEvent<SVGCircleElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setDragging(point);
      (e.target as SVGCircleElement).setPointerCapture(e.pointerId);
    },
    [disabled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging || disabled) return;
      const [svgX, svgY] = getSVGPoint(e);
      const [x, y] = fromSVG(svgX, svgY);

      const next: CubicBezier = [...value];
      if (dragging === 1) {
        next[0] = x;
        next[1] = y;
      } else {
        next[2] = x;
        next[3] = y;
      }
      onChange(next);
    },
    [dragging, disabled, getSVGPoint, fromSVG, value, onChange],
  );

  const handlePointerUp = useCallback(() => {
    if (dragging) {
      setDragging(null);
      onCommit?.(value);
    }
  }, [dragging, onCommit, value]);

  // Coordinates
  const [p0x, p0y] = toSVG(0, 0);
  const [p1x, p1y] = toSVG(value[0], value[1]);
  const [p2x, p2y] = toSVG(value[2], value[3]);
  const [p3x, p3y] = toSVG(1, 1);

  // Bezier curve path
  const curvePath = `M ${p0x} ${p0y} C ${p1x} ${p1y}, ${p2x} ${p2y}, ${p3x} ${p3y}`;

  // Linear reference path
  const linearPath = `M ${p0x} ${p0y} L ${p3x} ${p3y}`;

  // Grid lines
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const [gx] = toSVG(t, 0);
    const [, gy] = toSVG(0, t);
    gridLines.push(
      <line
        key={`v-${i}`}
        x1={gx}
        y1={PADDING}
        x2={gx}
        y2={height - PADDING}
        stroke="var(--border)"
        strokeWidth={1}
        strokeDasharray={i === 0 || i === 4 ? undefined : '2 4'}
      />,
      <line
        key={`h-${i}`}
        x1={PADDING}
        y1={gy}
        x2={width - PADDING}
        y2={gy}
        stroke="var(--border)"
        strokeWidth={1}
        strokeDasharray={i === 0 || i === 4 ? undefined : '2 4'}
      />,
    );
  }

  return (
    <div className="nodrag space-y-2">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className={`bg-[var(--background)] rounded border border-[var(--border)] ${
          disabled ? 'opacity-50 pointer-events-none' : 'cursor-crosshair'
        }`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Grid */}
        {gridLines}

        {/* Linear reference */}
        <path
          d={linearPath}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.3}
        />

        {/* Control point lines */}
        <line
          x1={p0x}
          y1={p0y}
          x2={p1x}
          y2={p1y}
          stroke="var(--primary)"
          strokeWidth={1}
          opacity={0.5}
        />
        <line
          x1={p3x}
          y1={p3y}
          x2={p2x}
          y2={p2y}
          stroke="var(--primary)"
          strokeWidth={1}
          opacity={0.5}
        />

        {/* Bezier curve */}
        <path
          d={curvePath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2.5}
        />

        {/* Endpoints */}
        <circle cx={p0x} cy={p0y} r={3} fill="var(--foreground)" />
        <circle cx={p3x} cy={p3y} r={3} fill="var(--foreground)" />

        {/* Control point 1 */}
        <circle
          cx={p1x}
          cy={p1y}
          r={POINT_RADIUS}
          fill="var(--primary)"
          stroke="var(--background)"
          strokeWidth={2}
          className={disabled ? '' : 'cursor-grab active:cursor-grabbing'}
          onPointerDown={handlePointerDown(1)}
        />

        {/* Control point 2 */}
        <circle
          cx={p2x}
          cy={p2y}
          r={POINT_RADIUS}
          fill="var(--accent)"
          stroke="var(--background)"
          strokeWidth={2}
          className={disabled ? '' : 'cursor-grab active:cursor-grabbing'}
          onPointerDown={handlePointerDown(2)}
        />
      </svg>

      {/* Coordinate display */}
      <div className="flex justify-between text-[10px] text-[var(--muted-foreground)] font-mono px-1">
        <span>
          P1: ({value[0].toFixed(2)}, {value[1].toFixed(2)})
        </span>
        <span>
          P2: ({value[2].toFixed(2)}, {value[3].toFixed(2)})
        </span>
      </div>
    </div>
  );
}

export const CubicBezierEditor = memo(CubicBezierEditorComponent);
